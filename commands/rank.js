<<<<<<< HEAD
import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import db from '../utils/database.js';
import { getXPProgress } from '../utils/xpSystem.js';
import { generateRankCard } from '../utils/cardGenerator.js';
=======
import { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../utils/database.js';
import { getXPProgress, getActiveBoostsText } from '../utils/xpSystem.js';
import { generateRankCard, getCardTheme, getThemeButtonStyle } from '../utils/cardGenerator.js';
>>>>>>> c07fa73 (Add robust error handling to all economy-related commands)

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Muestra el nivel y XP de un usuario')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario a consultar')
        .setRequired(false)
    ),
  
  async execute(interaction) {
<<<<<<< HEAD
    const targetUser = interaction.options.getUser('usuario') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id);
    
    const userData = db.getUser(interaction.guild.id, targetUser.id);
    const progress = getXPProgress(userData.totalXp, userData.level);
    
    await interaction.deferReply();
    
    try {
      const cardBuffer = await generateRankCard(member, userData, progress);
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });
      
      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      console.error('Error generating rank card:', error);
      await interaction.editReply({
        embeds: [{
=======
    try {
      const targetUser = interaction.options.getUser('usuario') || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id);
      
      const userData = db.getUser(interaction.guild.id, targetUser.id);
      const progress = getXPProgress(userData.totalXp, userData.level);
      const boosts = db.getActiveBoosts(targetUser.id, interaction.channelId);
      const boostsText = getActiveBoostsText(boosts);
      
      const theme = await getCardTheme(member, userData.level, userData.selectedCardTheme);
      const buttonStyle = getThemeButtonStyle(theme);
      
      try {
        const cardBuffer = await generateRankCard(member, userData, progress);
        const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });
        
        const rewardBtn = new ButtonBuilder()
          .setCustomId('earn_rewards')
          .setLabel('🎮 Gana Recompensas')
          .setStyle(buttonStyle);
        
        const row = new ActionRowBuilder().addComponents(rewardBtn);
        
        return await interaction.reply({ files: [attachment], components: [row] });
      } catch (error) {
        console.error('Error generating rank card:', error);
        
        const rewardBtn = new ButtonBuilder()
          .setCustomId('earn_rewards')
          .setLabel('🎮 Gana Recompensas')
          .setStyle(buttonStyle);
        
        const embed = {
>>>>>>> c07fa73 (Add robust error handling to all economy-related commands)
          color: 0x7289DA,
          title: `📊 Nivel de ${targetUser.username}`,
          fields: [
            { name: 'Nivel', value: `${userData.level}`, inline: true },
            { name: 'XP', value: `${Math.floor(progress.current)} / ${Math.floor(progress.needed)}`, inline: true },
            { name: 'Progreso', value: `${Math.floor(progress.percentage)}%`, inline: true }
          ]
<<<<<<< HEAD
        }]
      });
=======
        };
        
        if (boostsText) {
          embed.fields.push({ name: '🚀 Boosts Activos', value: boostsText });
        }
        
        return await interaction.reply({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(rewardBtn)]
        });
      }
    } catch (error) {
      console.error('Error in rank command:', error);
      return await interaction.reply({ content: `❌ Error: ${error.message}`, flags: 64 });
>>>>>>> c07fa73 (Add robust error handling to all economy-related commands)
    }
  }
};
