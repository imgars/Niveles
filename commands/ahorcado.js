import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import db from '../utils/database.js';
import { addLevels } from '../utils/xpSystem.js';

const HANGMAN_WORDS = [
  { word: 'DISCORD', hint: 'Plataforma de comunicación' },
  { word: 'MINECRAFT', hint: 'Juego de bloques' },
  { word: 'POKEMON', hint: 'Atrapa a todos' },
  { word: 'ROBOTICA', hint: 'Ciencia de robots' },
  { word: 'ASTRONAUTA', hint: 'Viaja al espacio' },
  { word: 'COMPUTADORA', hint: 'Dispositivo electrónico' },
  { word: 'PROGRAMACION', hint: 'Arte de crear código' },
  { word: 'VIDEOJUEGO', hint: 'Entretenimiento digital' },
  { word: 'TECNOLOGIA', hint: 'Avance científico' },
  { word: 'AVENTURA', hint: 'Viaje emocionante' },
  { word: 'DESARROLLO', hint: 'Crear software' },
  { word: 'SERVIDOR', hint: 'Hospeda comunidades' },
  { word: 'MODERADOR', hint: 'Cuida el servidor' },
  { word: 'COMUNIDAD', hint: 'Grupo de personas' },
  { word: 'RECOMPENSA', hint: 'Premio por logros' },
  { word: 'DESAFIO', hint: 'Reto a superar' },
  { word: 'VICTORIA', hint: 'Ganar el juego' },
  { word: 'JUGADOR', hint: 'Persona que juega' },
  { word: 'MENSAJE', hint: 'Comunicación escrita' },
  { word: 'RANKING', hint: 'Tabla de clasificación' }
];

const HANGMAN_STAGES = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
];

const activeGames = new Map();
const multiplayerGames = new Map();

export const data = new SlashCommandBuilder()
  .setName('ahorcado')
  .setDescription('Juega al ahorcado en modo solitario o multijugador')
  .addSubcommand(subcommand =>
    subcommand
      .setName('solo')
      .setDescription('Juega ahorcado en modo solitario (3 rondas, recompensas)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('multijugador')
      .setDescription('Inicia un juego de ahorcado multijugador')
      .addStringOption(option =>
        option
          .setName('palabra')
          .setDescription('La palabra secreta (mínimo 4 letras)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('pista')
          .setDescription('Una pista para ayudar al adivinador')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('adivinar')
      .setDescription('Únete a un juego de ahorcado multijugador')
      .addUserOption(option =>
        option
          .setName('host')
          .setDescription('El usuario que creó el juego')
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'solo') {
    await handleSoloMode(interaction);
  } else if (subcommand === 'multijugador') {
    await handleMultiplayerCreate(interaction);
  } else if (subcommand === 'adivinar') {
    await handleMultiplayerJoin(interaction);
  }
}

async function handleSoloMode(interaction) {
  const userId = interaction.user.id;

  if (db.isUserBanned(userId)) {
    return interaction.reply({
      content: '❌ Estás baneado de ganar XP y no puedes jugar minijuegos.',
      ephemeral: true
    });
  }

  const cooldown = db.checkCooldown('ahorcado_solo', userId);
  if (cooldown) {
    const hours = Math.ceil(cooldown / (1000 * 60 * 60));
    return interaction.reply({
      content: `⏰ Debes esperar **${hours} hora(s)** antes de jugar Ahorcado Solitario nuevamente.`,
      ephemeral: true
    });
  }

  if (activeGames.has(userId)) {
    return interaction.reply({
      content: '❌ Ya tienes un juego activo. Termínalo primero.',
      ephemeral: true
    });
  }

  const gameState = {
    userId,
    round: 1,
    maxRounds: 3,
    wins: 0,
    currentWord: null,
    currentHint: null,
    guessedLetters: new Set(),
    wrongGuesses: 0,
    maxWrongGuesses: 6,
    messageId: null,
    channelId: interaction.channel.id
  };

  activeGames.set(userId, gameState);
  await startNewRound(interaction, gameState);
}

async function startNewRoundFromChannel(channel, gameState) {
  const randomWord = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
  gameState.currentWord = randomWord.word;
  gameState.currentHint = randomWord.hint;
  gameState.guessedLetters = new Set();
  gameState.wrongGuesses = 0;

  const embed = createGameEmbed(gameState);
  const selector = createLetterSelector(gameState, 'hangman_select');

  const message = await channel.send({
    content: `<@${gameState.userId}>`,
    embeds: [embed],
    components: selector
  });

  gameState.messageId = message.id;

  const collector = message.createMessageComponentCollector({
    filter: i => i.user.id === gameState.userId,
    time: 300000
  });

  collector.on('collect', async i => {
    const letter = i.values[0];
    
    if (gameState.guessedLetters.has(letter)) {
      return i.reply({
        content: `❌ Ya elegiste la letra **${letter}**`,
        ephemeral: true
      });
    }

    gameState.guessedLetters.add(letter);

    if (!gameState.currentWord.includes(letter)) {
      gameState.wrongGuesses++;
    }

    const isWon = checkWin(gameState);
    const isLost = gameState.wrongGuesses >= gameState.maxWrongGuesses;

    const newEmbed = createGameEmbed(gameState);
    const newSelector = isWon || isLost ? [] : createLetterSelector(gameState, 'hangman_select');

    await i.update({
      embeds: [newEmbed],
      components: newSelector
    });

    if (isWon) {
      gameState.wins++;
      collector.stop('won');
      
      if (gameState.round < gameState.maxRounds) {
        gameState.round++;
        setTimeout(async () => {
          await startNewRoundFromChannel(channel, gameState);
        }, 3000);
      } else {
        await handleGameEndFromChannel(channel, gameState);
      }
    } else if (isLost) {
      collector.stop('lost');
      
      if (gameState.round < gameState.maxRounds) {
        gameState.round++;
        setTimeout(async () => {
          await startNewRoundFromChannel(channel, gameState);
        }, 3000);
      } else {
        await handleGameEndFromChannel(channel, gameState);
      }
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      activeGames.delete(gameState.userId);
      db.setCooldown('ahorcado_solo', gameState.userId, 48 * 60 * 60 * 1000);
      
      try {
        await message.edit({
          content: '⏰ Tiempo agotado. El juego ha finalizado. Cooldown de 48h aplicado.',
          components: []
        });
      } catch (error) {
        console.error('Error editing message on timeout:', error);
      }
    }
  });
}

async function handleGameEndFromChannel(channel, gameState) {
  activeGames.delete(gameState.userId);

  const embed = new EmbedBuilder()
    .setColor(gameState.wins >= 2 ? '#4CAF50' : '#FF6B6B')
    .setTitle('🎮 Juego Finalizado')
    .setDescription(`**Resultado Final:**\nVictorias: **${gameState.wins}/${gameState.maxRounds}**`);

  if (gameState.wins >= 2) {
    const choice = Math.random() < 0.5 ? 'boost' : 'level';

    if (choice === 'boost') {
      db.addBoost(
        'user',
        gameState.userId,
        0.25,
        24 * 60 * 60 * 1000,
        'Ahorcado Solitario'
      );
      embed.addFields({
        name: '🎉 ¡Recompensa!',
        value: '**+25% de XP** durante 24 horas'
      });
    } else {
      const guildId = channel.guild.id;
      const userData = db.getUser(guildId, gameState.userId);
      userData.totalXp = addLevels(userData.totalXp, 1);
      db.saveUser(guildId, gameState.userId, userData);
      
      embed.addFields({
        name: '🎉 ¡Recompensa!',
        value: '**+1 Nivel completo**'
      });
    }
  } else {
    embed.addFields({
      name: '😔 Sin recompensa',
      value: 'Necesitas ganar 2 de 3 rondas para obtener premios'
    });
  }

  db.setCooldown('ahorcado_solo', gameState.userId, 48 * 60 * 60 * 1000);

  await channel.send({ embeds: [embed] });
}

async function startNewRound(interaction, gameState, isFirstRound = true) {
  const randomWord = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
  gameState.currentWord = randomWord.word;
  gameState.currentHint = randomWord.hint;
  gameState.guessedLetters = new Set();
  gameState.wrongGuesses = 0;

  const embed = createGameEmbed(gameState);
  const selector = createLetterSelector(gameState, 'hangman_select');

  let message;
  if (isFirstRound) {
    message = await interaction.reply({
      embeds: [embed],
      components: selector,
      fetchReply: true
    });
    gameState.client = interaction.client;
  } else {
    const channel = await interaction.client.channels.fetch(gameState.channelId);
    message = await channel.send({
      content: `<@${gameState.userId}>`,
      embeds: [embed],
      components: selector
    });
  }

  gameState.messageId = message.id;

  const collector = message.createMessageComponentCollector({
    filter: i => i.user.id === gameState.userId,
    time: 300000
  });

  collector.on('collect', async i => {
    const letter = i.values[0];
    
    if (gameState.guessedLetters.has(letter)) {
      return i.reply({
        content: `❌ Ya elegiste la letra **${letter}**`,
        ephemeral: true
      });
    }

    gameState.guessedLetters.add(letter);

    if (!gameState.currentWord.includes(letter)) {
      gameState.wrongGuesses++;
    }

    const isWon = checkWin(gameState);
    const isLost = gameState.wrongGuesses >= gameState.maxWrongGuesses;

    const newEmbed = createGameEmbed(gameState);
    const newSelector = isWon || isLost ? [] : createLetterSelector(gameState, 'hangman_select');

    await i.update({
      embeds: [newEmbed],
      components: newSelector
    });

    if (isWon) {
      gameState.wins++;
      collector.stop('won');
      
      if (gameState.round < gameState.maxRounds) {
        gameState.round++;
        setTimeout(async () => {
          const channel = await gameState.client.channels.fetch(gameState.channelId);
          await startNewRoundFromChannel(channel, gameState);
        }, 3000);
      } else {
        await handleGameEnd(i, gameState);
      }
    } else if (isLost) {
      collector.stop('lost');
      
      if (gameState.round < gameState.maxRounds) {
        gameState.round++;
        setTimeout(async () => {
          const channel = await gameState.client.channels.fetch(gameState.channelId);
          await startNewRoundFromChannel(channel, gameState);
        }, 3000);
      } else {
        await handleGameEnd(i, gameState);
      }
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      activeGames.delete(gameState.userId);
      db.setCooldown('ahorcado_solo', gameState.userId, 48 * 60 * 60 * 1000);
      
      try {
        await message.edit({
          content: '⏰ Tiempo agotado. El juego ha finalizado. Cooldown de 48h aplicado.',
          components: []
        });
      } catch (error) {
        console.error('Error editing message on timeout:', error);
      }
    }
  });
}

function createGameEmbed(gameState) {
  const displayWord = getDisplayWord(gameState);
  const hangmanStage = HANGMAN_STAGES[gameState.wrongGuesses];

  const embed = new EmbedBuilder()
    .setColor('#FF6B6B')
    .setTitle('🎯 Ahorcado Solitario')
    .setDescription(`**Ronda ${gameState.round}/${gameState.maxRounds}** | Victorias: ${gameState.wins}`)
    .addFields(
      { name: '💡 Pista', value: gameState.currentHint, inline: false },
      { name: '📝 Palabra', value: displayWord, inline: false },
      { name: '🎨 Estado', value: hangmanStage, inline: false },
      { 
        name: '❌ Errores', 
        value: `${gameState.wrongGuesses}/${gameState.maxWrongGuesses}`, 
        inline: true 
      },
      {
        name: '🔤 Letras usadas',
        value: Array.from(gameState.guessedLetters).sort().join(', ') || 'Ninguna',
        inline: true
      }
    )
    .setFooter({ text: 'Tienes 5 minutos por ronda' });

  return embed;
}

function getDisplayWord(gameState) {
  return gameState.currentWord
    .split('')
    .map(letter => gameState.guessedLetters.has(letter) ? letter : '_')
    .join(' ');
}

function checkWin(gameState) {
  return gameState.currentWord.split('').every(letter => gameState.guessedLetters.has(letter));
}

function createLetterSelector(gameState, customId) {
  const alphabet = 'ABCDEFGHIJKLMNÑOPQRSTUVYZ'.split('');
  
  const options = alphabet.map(letter => {
    const isUsed = gameState.guessedLetters.has(letter);
    return new StringSelectMenuOptionBuilder()
      .setLabel(isUsed ? `${letter} (usada)` : letter)
      .setValue(letter)
      .setDefault(false);
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Selecciona una letra')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  return [row];
}

async function handleGameEnd(interaction, gameState) {
  activeGames.delete(gameState.userId);

  const embed = new EmbedBuilder()
    .setColor(gameState.wins >= 2 ? '#4CAF50' : '#FF6B6B')
    .setTitle('🎮 Juego Finalizado')
    .setDescription(`**Resultado Final:**\nVictorias: **${gameState.wins}/${gameState.maxRounds}**`);

  if (gameState.wins >= 2) {
    const choice = Math.random() < 0.5 ? 'boost' : 'level';

    if (choice === 'boost') {
      db.addBoost(
        'user',
        gameState.userId,
        0.25,
        24 * 60 * 60 * 1000,
        'Ahorcado Solitario'
      );
      embed.addFields({
        name: '🎉 ¡Recompensa!',
        value: '**+25% de XP** durante 24 horas'
      });
    } else {
      const userData = db.getUser(interaction.guild.id, gameState.userId);
      userData.totalXp = addLevels(userData.totalXp, 1);
      db.saveUser(interaction.guild.id, gameState.userId, userData);
      
      embed.addFields({
        name: '🎉 ¡Recompensa!',
        value: '**+1 Nivel completo**'
      });
    }
  } else {
    embed.addFields({
      name: '😔 Sin recompensa',
      value: 'Necesitas ganar 2 de 3 rondas para obtener premios'
    });
  }

  db.setCooldown('ahorcado_solo', gameState.userId, 48 * 60 * 60 * 1000);

  await interaction.followUp({ embeds: [embed] });
}

async function handleMultiplayerCreate(interaction) {
  const word = interaction.options.getString('palabra').toUpperCase().trim();
  const hint = interaction.options.getString('pista');
  const userId = interaction.user.id;

  if (word.length < 4) {
    return interaction.reply({
      content: '❌ La palabra debe tener al menos 4 letras.',
      ephemeral: true
    });
  }

  if (!/^[ABCDEFGHIJKLMNÑOPQRSTUVYZ]+$/.test(word)) {
    return interaction.reply({
      content: '❌ La palabra solo puede contener estas letras: A-Z, Ñ (excepto W y X).',
      ephemeral: true
    });
  }

  if (multiplayerGames.has(userId)) {
    return interaction.reply({
      content: '❌ Ya tienes un juego multijugador activo.',
      ephemeral: true
    });
  }

  const gameState = {
    hostId: userId,
    word,
    hint,
    guesserId: null,
    guessedLetters: new Set(),
    wrongGuesses: 0,
    maxWrongGuesses: 6,
    createdAt: Date.now()
  };

  multiplayerGames.set(userId, gameState);

  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('🎯 Ahorcado Multijugador - Esperando')
    .setDescription(`**Host:** <@${userId}>\n**Pista:** ${hint}`)
    .addFields({
      name: '👥 Cómo jugar',
      value: 'Usa `/ahorcado adivinar @host` para unirte al juego'
    })
    .setFooter({ text: 'El juego expira en 10 minutos si nadie se une' });

  await interaction.reply({ embeds: [embed] });

  setTimeout(() => {
    if (multiplayerGames.has(userId) && !multiplayerGames.get(userId).guesserId) {
      multiplayerGames.delete(userId);
    }
  }, 600000);
}

async function handleMultiplayerJoin(interaction) {
  const host = interaction.options.getUser('host');
  const guesser = interaction.user;

  if (host.id === guesser.id) {
    return interaction.reply({
      content: '❌ No puedes jugar tu propio juego.',
      ephemeral: true
    });
  }

  if (db.isUserBanned(guesser.id)) {
    return interaction.reply({
      content: '❌ Estás baneado de ganar XP y no puedes jugar minijuegos.',
      ephemeral: true
    });
  }

  const gameState = multiplayerGames.get(host.id);

  if (!gameState) {
    return interaction.reply({
      content: `❌ <@${host.id}> no tiene un juego activo.`,
      ephemeral: true
    });
  }

  if (gameState.guesserId) {
    return interaction.reply({
      content: '❌ Este juego ya tiene un jugador.',
      ephemeral: true
    });
  }

  const cooldown = db.checkCooldown('ahorcado_multi', guesser.id);
  if (cooldown) {
    const minutes = Math.ceil(cooldown / (1000 * 60));
    return interaction.reply({
      content: `⏰ Debes esperar **${minutes} minuto(s)** antes de jugar Ahorcado Multijugador nuevamente.`,
      ephemeral: true
    });
  }

  gameState.guesserId = guesser.id;

  const embed = createMultiplayerEmbed(gameState, host, guesser);
  const selector = createLetterSelector(gameState, 'hangman_mp_select');

  const message = await interaction.reply({
    content: `<@${host.id}> vs <@${guesser.id}>`,
    embeds: [embed],
    components: selector,
    fetchReply: true
  });

  const collector = message.createMessageComponentCollector({
    filter: i => i.user.id === guesser.id,
    time: 300000
  });

  collector.on('collect', async i => {
    const letter = i.values[0];

    if (gameState.guessedLetters.has(letter)) {
      return i.reply({
        content: `❌ Ya elegiste la letra **${letter}**`,
        ephemeral: true
      });
    }

    gameState.guessedLetters.add(letter);

    if (!gameState.word.includes(letter)) {
      gameState.wrongGuesses++;
    }

    const isWon = gameState.word.split('').every(l => gameState.guessedLetters.has(l));
    const isLost = gameState.wrongGuesses >= gameState.maxWrongGuesses;

    const newEmbed = createMultiplayerEmbed(gameState, host, guesser);
    const newSelector = isWon || isLost ? [] : createLetterSelector(gameState, 'hangman_mp_select');

    await i.update({
      embeds: [newEmbed],
      components: newSelector
    });

    if (isWon || isLost) {
      collector.stop(isWon ? 'won' : 'lost');
      await handleMultiplayerEnd(i, gameState, host, guesser, isWon);
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      multiplayerGames.delete(host.id);
      try {
        await message.edit({
          content: '⏰ Tiempo agotado.',
          components: []
        });
      } catch (error) {
        console.error('Error editing message on timeout:', error);
      }
    }
  });
}

function createMultiplayerEmbed(gameState, host, guesser) {
  const displayWord = gameState.word
    .split('')
    .map(letter => gameState.guessedLetters.has(letter) ? letter : '_')
    .join(' ');
  
  const hangmanStage = HANGMAN_STAGES[gameState.wrongGuesses];

  return new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('🎯 Ahorcado Multijugador')
    .setDescription(`**Host:** <@${host.id}>\n**Adivinador:** <@${guesser.id}>`)
    .addFields(
      { name: '💡 Pista', value: gameState.hint, inline: false },
      { name: '📝 Palabra', value: displayWord, inline: false },
      { name: '🎨 Estado', value: hangmanStage, inline: false },
      { 
        name: '❌ Errores', 
        value: `${gameState.wrongGuesses}/${gameState.maxWrongGuesses}`, 
        inline: true 
      },
      {
        name: '🔤 Letras usadas',
        value: Array.from(gameState.guessedLetters).sort().join(', ') || 'Ninguna',
        inline: true
      }
    )
    .setFooter({ text: 'Tienes 5 minutos para adivinar' });
}


async function handleMultiplayerEnd(interaction, gameState, host, guesser, guesserWon) {
  multiplayerGames.delete(host.id);

  const embed = new EmbedBuilder()
    .setColor(guesserWon ? '#4CAF50' : '#FF6B6B')
    .setTitle('🎮 Juego Finalizado')
    .setDescription(`**Palabra:** ${gameState.word}`)
    .addFields({
      name: guesserWon ? '🏆 Ganador' : '😔 Perdedor',
      value: `<@${guesser.id}>`
    });

  if (guesserWon) {
    const userData = db.getUser(interaction.guild.id, guesser.id);
    userData.totalXp = addLevels(userData.totalXp, 0.5);
    db.saveUser(interaction.guild.id, guesser.id, userData);

    embed.addFields({
      name: '🎁 Recompensa',
      value: '**+0.5 Niveles** para el adivinador'
    });
  } else {
    embed.addFields({
      name: '💔 Sin recompensa',
      value: 'El adivinador no logró descubrir la palabra'
    });
  }

  db.setCooldown('ahorcado_multi', guesser.id, 30 * 60 * 1000);

  await interaction.followUp({ embeds: [embed] });
}
