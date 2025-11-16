import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../utils/database.js';
import { addLevels, removeLevels, calculateLevel } from '../utils/xpSystem.js';
import { formatDuration } from '../utils/helpers.js';

const triviaQuestions = [
  {
    question: '¿Cuál es la capital de Venezuela?',
    options: ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto'],
    correct: 0
  },
  {
    question: '¿En qué año se independizó Venezuela?',
    options: ['1810', '1811', '1812', '1813'],
    correct: 1
  },
  {
    question: '¿Cuál es el río más largo del mundo?',
    options: ['Nilo', 'Amazonas', 'Yangtsé', 'Misisipi'],
    correct: 1
  },
  {
    question: '¿Quién pintó la Mona Lisa?',
    options: ['Van Gogh', 'Picasso', 'Da Vinci', 'Miguel Ángel'],
    correct: 2
  },
  {
    question: '¿Cuántos continentes hay en la Tierra?',
    options: ['5', '6', '7', '8'],
    correct: 2
  }
];

export default {
  data: new SlashCommandBuilder()
    .setName('minigame')
    .setDescription('Juega minijuegos para ganar recompensas')
    .addSubcommand(subcommand =>
      subcommand
        .setName('trivia')
        .setDescription('Responde 5 preguntas de trivia')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rps')
        .setDescription('Piedra, Papel o Tijeras contra otro usuario')
        .addUserOption(option =>
          option.setName('oponente')
            .setDescription('Usuario contra el que jugar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('roulette')
        .setDescription('Ruleta Rusa contra otro usuario')
        .addUserOption(option =>
          option.setName('oponente')
            .setDescription('Usuario contra el que jugar')
            .setRequired(true)
        )
    ),
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'trivia') {
      const cooldown = db.checkCooldown('minigame_trivia', interaction.user.id);
      if (cooldown) {
        return interaction.reply({
          content: `⏱️ Debes esperar ${formatDuration(cooldown)} antes de jugar trivia de nuevo.`,
          ephemeral: true
        });
      }
      
      await playTrivia(interaction);
    }
    
    if (subcommand === 'rps') {
      const cooldown = db.checkCooldown('minigame_rps', interaction.user.id);
      const opponent = interaction.options.getUser('oponente');
      
      if (opponent.bot) {
        return interaction.reply({ content: '❌ No puedes jugar contra un bot.', ephemeral: true });
      }
      
      if (opponent.id === interaction.user.id) {
        return interaction.reply({ content: '❌ No puedes jugar contra ti mismo.', ephemeral: true });
      }
      
      if (cooldown) {
        return interaction.reply({
          content: `⏱️ Debes esperar ${formatDuration(cooldown)} antes de jugar RPS de nuevo para ganar recompensas, pero puedes seguir jugando sin recompensas.`,
          ephemeral: true
        });
      }
      
      await playRPS(interaction, opponent, !cooldown);
    }
    
    if (subcommand === 'roulette') {
      const cooldown = db.checkCooldown('minigame_roulette', interaction.user.id);
      const opponent = interaction.options.getUser('oponente');
      
      if (opponent.bot) {
        return interaction.reply({ content: '❌ No puedes jugar contra un bot.', ephemeral: true });
      }
      
      if (opponent.id === interaction.user.id) {
        return interaction.reply({ content: '❌ No puedes jugar contra ti mismo.', ephemeral: true });
      }
      
      if (cooldown) {
        return interaction.reply({
          content: `⏱️ Debes esperar ${formatDuration(cooldown)} antes de jugar Ruleta Rusa de nuevo para ganar recompensas, pero puedes seguir jugando sin recompensas.`,
          ephemeral: true
        });
      }
      
      await playRoulette(interaction, opponent, !cooldown);
    }
  }
};

async function playTrivia(interaction) {
  let currentQuestion = 0;
  let correctAnswers = 0;
  let firstTryCorrect = true;
  
  await askQuestion(interaction);
  
  async function askQuestion(inter) {
    if (currentQuestion >= triviaQuestions.length) {
      return showResults(inter);
    }
    
    const q = triviaQuestions[currentQuestion];
    const row = new ActionRowBuilder();
    
    for (let i = 0; i < q.options.length; i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`trivia_${i}`)
          .setLabel(q.options[i])
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    const msg = await inter.reply({
      embeds: [{
        color: 0x7289DA,
        title: `🎯 Trivia - Pregunta ${currentQuestion + 1}/5`,
        description: q.question,
        footer: { text: `Respuestas correctas: ${correctAnswers}` }
      }],
      components: [row],
      fetchReply: true
    });
    
    const collector = msg.createMessageComponentCollector({ time: 20000 });
    
    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: '❌ Este no es tu juego.', ephemeral: true });
      }
      
      const answer = parseInt(i.customId.split('_')[1]);
      const correct = answer === q.correct;
      
      if (correct) {
        correctAnswers++;
      } else {
        firstTryCorrect = false;
      }
      
      currentQuestion++;
      collector.stop();
      
      await i.update({
        embeds: [{
          color: correct ? 0x43B581 : 0xF04747,
          title: correct ? '✅ ¡Correcto!' : '❌ Incorrecto',
          description: `La respuesta correcta era: **${q.options[q.correct]}**`
        }],
        components: []
      });
      
      setTimeout(() => askQuestion(i), 2000);
    });
    
    collector.on('end', collected => {
      if (collected.size === 0) {
        inter.editReply({
          embeds: [{
            color: 0xF04747,
            title: '⏱️ Tiempo Agotado',
            description: 'No respondiste a tiempo.'
          }],
          components: []
        });
      }
    });
  }
  
  async function showResults(inter) {
    if (correctAnswers === 5 && firstTryCorrect) {
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('trivia_reward_boost')
            .setLabel('Boost 20% x 12h')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('trivia_reward_levels')
            .setLabel('1.5 Niveles')
            .setStyle(ButtonStyle.Success)
        );
      
      const rewardMsg = await inter.followUp({
        embeds: [{
          color: 0xFFD700,
          title: '🏆 ¡Perfecto!',
          description: `¡Respondiste todas las preguntas correctamente!\n\nElige tu recompensa:`,
          fields: [
            { name: '🚀 Boost', value: '20% XP durante 12 horas', inline: true },
            { name: '⭐ Niveles', value: '1.5 niveles instantáneos', inline: true }
          ]
        }],
        components: [row],
        fetchReply: true
      });
      
      const rewardCollector = rewardMsg.createMessageComponentCollector({ time: 30000 });
      
      rewardCollector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '❌ Esta no es tu recompensa.', ephemeral: true });
        }
        
        if (i.customId === 'trivia_reward_boost') {
          db.addBoost('user', interaction.user.id, 0.2, 12 * 60 * 60 * 1000, 'Boost de trivia 20% por 12h');
          await i.update({
            embeds: [{
              color: 0x43B581,
              title: '✅ Recompensa Recibida',
              description: '¡Has recibido un boost de 20% durante 12 horas!'
            }],
            components: []
          });
        } else {
          const userData = db.getUser(interaction.guild.id, interaction.user.id);
          userData.totalXp = addLevels(userData.totalXp, 1.5);
          userData.level = calculateLevel(userData.totalXp);
          db.saveUser(interaction.guild.id, interaction.user.id, userData);
          
          await i.update({
            embeds: [{
              color: 0x43B581,
              title: '✅ Recompensa Recibida',
              description: `¡Has subido 1.5 niveles! Ahora estás en el nivel ${userData.level}`
            }],
            components: []
          });
        }
        
        db.setCooldown('minigame_trivia', interaction.user.id, 12 * 60 * 60 * 1000);
        rewardCollector.stop();
      });
    } else {
      await inter.followUp({
        embeds: [{
          color: correctAnswers >= 3 ? 0xFFD700 : 0xF04747,
          title: '📊 Resultados',
          description: `Respondiste correctamente **${correctAnswers}/5** preguntas.${correctAnswers === 5 ? '\n\nPero no todas fueron al primer intento.' : ''}`,
          footer: { text: 'Intenta de nuevo para ganar recompensas' }
        }]
      });
    }
  }
}

async function playRPS(interaction, opponent, hasReward) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('rps_accept')
        .setLabel('Aceptar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('rps_decline')
        .setLabel('Rechazar')
        .setStyle(ButtonStyle.Danger)
    );
  
  const msg = await interaction.reply({
    content: `<@${opponent.id}>`,
    embeds: [{
      color: 0x7289DA,
      title: '🎮 Piedra, Papel o Tijeras',
      description: `<@${interaction.user.id}> te ha retado a jugar Piedra, Papel o Tijeras (mejor de 3)!\n\n${hasReward ? '**Recompensa:** El ganador recibe un boost de 30% durante 2 horas.' : '**Sin recompensa** (cooldown activo)'}`
    }],
    components: [row],
    fetchReply: true
  });
  
  const collector = msg.createMessageComponentCollector({ time: 60000 });
  
  collector.on('collect', async i => {
    if (i.user.id !== opponent.id) {
      return i.reply({ content: '❌ Este desafío no es para ti.', ephemeral: true });
    }
    
    if (i.customId === 'rps_decline') {
      await i.update({
        embeds: [{
          color: 0xF04747,
          title: '❌ Desafío Rechazado',
          description: `<@${opponent.id}> ha rechazado el desafío.`
        }],
        components: []
      });
      collector.stop();
      return;
    }
    
    if (i.customId === 'rps_accept') {
      collector.stop();
      await startRPSGame(i, interaction.user, opponent, hasReward);
    }
  });
}

async function startRPSGame(interaction, player1, player2, hasReward) {
  let p1Wins = 0;
  let p2Wins = 0;
  let round = 1;
  
  await playRound();
  
  async function playRound() {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('rps_rock')
          .setLabel('🪨 Piedra')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('rps_paper')
          .setLabel('📄 Papel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('rps_scissors')
          .setLabel('✂️ Tijeras')
          .setStyle(ButtonStyle.Primary)
      );
    
    await interaction.update({
      embeds: [{
        color: 0x7289DA,
        title: `🎮 Ronda ${round}`,
        description: `**Puntuación:**\n<@${player1.id}>: ${p1Wins} | <@${player2.id}>: ${p2Wins}\n\nHagan su elección:`,
      }],
      components: [row]
    });
    
    const choices = {};
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 30000 });
    
    collector.on('collect', async i => {
      if (i.user.id !== player1.id && i.user.id !== player2.id) {
        return i.reply({ content: '❌ No estás en este juego.', ephemeral: true });
      }
      
      if (choices[i.user.id]) {
        return i.reply({ content: '❌ Ya hiciste tu elección.', ephemeral: true });
      }
      
      const choice = i.customId.split('_')[1];
      choices[i.user.id] = choice;
      
      await i.reply({ content: `✅ Elección registrada: ${choice}`, ephemeral: true });
      
      if (Object.keys(choices).length === 2) {
        collector.stop();
        await resolveRound(choices);
      }
    });
  }
  
  async function resolveRound(choices) {
    const p1Choice = choices[player1.id];
    const p2Choice = choices[player2.id];
    
    let winner = null;
    if (p1Choice === p2Choice) {
      winner = 'tie';
    } else if (
      (p1Choice === 'rock' && p2Choice === 'scissors') ||
      (p1Choice === 'paper' && p2Choice === 'rock') ||
      (p1Choice === 'scissors' && p2Choice === 'paper')
    ) {
      winner = player1.id;
      p1Wins++;
    } else {
      winner = player2.id;
      p2Wins++;
    }
    
    const emoji = { rock: '🪨', paper: '📄', scissors: '✂️' };
    
    await interaction.editReply({
      embeds: [{
        color: winner === 'tie' ? 0xFFD700 : 0x43B581,
        title: winner === 'tie' ? '🤝 Empate' : `✅ Ganador de la Ronda: <@${winner}>`,
        description: `<@${player1.id}>: ${emoji[p1Choice]}\n<@${player2.id}>: ${emoji[p2Choice]}`
      }],
      components: []
    });
    
    if (p1Wins === 3 || p2Wins === 3) {
      setTimeout(() => endGame(), 2000);
    } else {
      round++;
      setTimeout(() => playRound(), 2000);
    }
  }
  
  async function endGame() {
    const winner = p1Wins === 3 ? player1 : player2;
    
    if (hasReward) {
      db.addBoost('user', winner.id, 0.3, 2 * 60 * 60 * 1000, 'Boost de RPS 30% por 2h');
      db.setCooldown('minigame_rps', player1.id, 12 * 60 * 60 * 1000);
      db.setCooldown('minigame_rps', player2.id, 12 * 60 * 60 * 1000);
    }
    
    await interaction.editReply({
      embeds: [{
        color: 0xFFD700,
        title: '🏆 ¡Juego Terminado!',
        description: `**Ganador:** <@${winner.id}>\n\n**Puntuación Final:**\n<@${player1.id}>: ${p1Wins}\n<@${player2.id}>: ${p2Wins}${hasReward ? `\n\n✨ <@${winner.id}> ha ganado un boost de 30% durante 2 horas!` : ''}`,
      }],
      components: []
    });
  }
}

async function playRoulette(interaction, opponent, hasReward) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('roulette_accept')
        .setLabel('Aceptar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('roulette_decline')
        .setLabel('Rechazar')
        .setStyle(ButtonStyle.Danger)
    );
  
  const msg = await interaction.reply({
    content: `<@${opponent.id}>`,
    embeds: [{
      color: 0xFF0000,
      title: '💀 Ruleta Rusa',
      description: `<@${interaction.user.id}> te ha retado a jugar Ruleta Rusa!\n\n⚠️ **ADVERTENCIA:**\n${hasReward ? '• El **GANADOR** gana **2.5 niveles**\n• El **PERDEDOR** pierde **3 niveles**' : '• **Sin recompensas** (cooldown activo)'}`,
      footer: { text: '¡Este juego tiene consecuencias!' }
    }],
    components: [row],
    fetchReply: true
  });
  
  const collector = msg.createMessageComponentCollector({ time: 60000 });
  
  collector.on('collect', async i => {
    if (i.user.id !== opponent.id) {
      return i.reply({ content: '❌ Este desafío no es para ti.', ephemeral: true });
    }
    
    if (i.customId === 'roulette_decline') {
      await i.update({
        embeds: [{
          color: 0xF04747,
          title: '❌ Desafío Rechazado',
          description: `<@${opponent.id}> ha rechazado el desafío.`
        }],
        components: []
      });
      collector.stop();
      return;
    }
    
    if (i.customId === 'roulette_accept') {
      collector.stop();
      await startRouletteGame(i, interaction.user, opponent, hasReward);
    }
  });
}

async function startRouletteGame(interaction, player1, player2, hasReward) {
  const chamber = Array(6).fill(false);
  const bulletPos = Math.floor(Math.random() * 6);
  chamber[bulletPos] = true;
  
  let currentPlayer = Math.random() < 0.5 ? player1 : player2;
  let shotsFired = 0;
  
  await interaction.update({
    embeds: [{
      color: 0xFFD700,
      title: '🔫 Ruleta Rusa',
      description: `El tambor ha sido cargado y girado...\n\n<@${currentPlayer.id}> dispara primero.`,
    }],
    components: []
  });
  
  setTimeout(() => takeTurn(), 2000);
  
  async function takeTurn() {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('roulette_shoot')
          .setLabel('🔫 Disparar')
          .setStyle(ButtonStyle.Danger)
      );
    
    const remaining = 6 - shotsFired;
    const probability = Math.round((1 / remaining) * 100);
    
    await interaction.editReply({
      embeds: [{
        color: 0xFF4444,
        title: '🔫 Tu Turno',
        description: `<@${currentPlayer.id}>, es tu turno...\n\n**Cámaras restantes:** ${remaining}\n**Probabilidad de BANG:** ${probability}%`,
      }],
      components: [row]
    });
    
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 30000 });
    
    collector.on('collect', async i => {
      if (i.user.id !== currentPlayer.id) {
        return i.reply({ content: '❌ No es tu turno.', ephemeral: true });
      }
      
      collector.stop();
      
      if (chamber[shotsFired]) {
        await i.update({
          embeds: [{
            color: 0xFF0000,
            title: '💥 BANG!',
            description: `<@${currentPlayer.id}> ha sido eliminado!`,
          }],
          components: []
        });
        
        setTimeout(() => endRouletteGame(currentPlayer === player1 ? player2 : player1, currentPlayer), 2000);
      } else {
        await i.update({
          embeds: [{
            color: 0x43B581,
            title: '💨 Clic...',
            description: `<@${currentPlayer.id}> está a salvo... por ahora.`,
          }],
          components: []
        });
        
        shotsFired++;
        currentPlayer = currentPlayer === player1 ? player2 : player1;
        setTimeout(() => takeTurn(), 2000);
      }
    });
  }
  
  async function endRouletteGame(winner, loser) {
    if (hasReward) {
      const winnerData = db.getUser(interaction.guild.id, winner.id);
      const loserData = db.getUser(interaction.guild.id, loser.id);
      
      winnerData.totalXp = addLevels(winnerData.totalXp, 2.5);
      winnerData.level = calculateLevel(winnerData.totalXp);
      
      loserData.totalXp = removeLevels(loserData.totalXp, 3);
      loserData.level = calculateLevel(loserData.totalXp);
      
      db.saveUser(interaction.guild.id, winner.id, winnerData);
      db.saveUser(interaction.guild.id, loser.id, loserData);
      
      db.setCooldown('minigame_roulette', player1.id, 24 * 60 * 60 * 1000);
      db.setCooldown('minigame_roulette', player2.id, 24 * 60 * 60 * 1000);
    }
    
    await interaction.editReply({
      embeds: [{
        color: 0xFFD700,
        title: '🏆 ¡Juego Terminado!',
        description: `**Ganador:** <@${winner.id}>\n**Perdedor:** <@${loser.id}>${hasReward ? `\n\n✨ <@${winner.id}> ha ganado **2.5 niveles**\n💔 <@${loser.id}> ha perdido **3 niveles**` : ''}`,
      }],
      components: []
    });
  }
}
