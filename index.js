const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Configuration
const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    channelId: process.env.CHANNEL_ID,
    bumpInterval: 2 * 60 * 60 * 1000, // 2 heures
    reminderInterval: 30 * 60 * 1000, // Rappel toutes les 30 minutes
};

// Vérification des variables d'environnement
if (!config.token || !config.clientId || !config.channelId) {
    console.error('❌ Variables d\'environnement manquantes!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Variables pour le suivi
let bumpInterval = null;
let reminderInterval = null;
let isBumpActive = false;
let lastBumpTime = null;
let nextBumpTime = null;

// Commandes slash
const commands = [
    new SlashCommandBuilder()
        .setName('bump-start')
        .setDescription('Démarrer le système de bump automatique'),
    
    new SlashCommandBuilder()
        .setName('bump-stop')
        .setDescription('Arrêter le système de bump automatique'),
    
    new SlashCommandBuilder()
        .setName('bump-status')
        .setDescription('Voir le statut du bump automatique'),
    
    new SlashCommandBuilder()
        .setName('bump-now')
        .setDescription('Forcer un bump immédiat')
].map(command => command.toJSON());

// Enregistrement des commandes slash
const rest = new REST({ version: '10' }).setToken(config.token);

async function registerCommands() {
    try {
        console.log('🔄 Enregistrement des commandes slash...');
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        console.log('✅ Commandes slash enregistrées!');
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement:', error);
    }
}

// Fonction pour créer l'embed de bump
function createBumpEmbed() {
    return new EmbedBuilder()
        .setTitle('🚀 **BUMP AUTOMATIQUE**')
        .setDescription('Le serveur a été bumpé pour plus de visibilité!')
        .addFields(
            { name: '🕒 Dernier bump', value: lastBumpTime ? `<t:${Math.floor(lastBumpTime.getTime() / 1000)}:R>` : 'Aucun', inline: true },
            { name: '⏰ Prochain bump', value: nextBumpTime ? `<t:${Math.floor(nextBumpTime.getTime() / 1000)}:R>` : 'Non programmé', inline: true },
            { name: '🔔 Statut', value: isBumpActive ? '🟢 ACTIF' : '🔴 INACTIF', inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: 'Système de Bump Auto • Toutes les 2 heures' });
}

// Fonction pour créer les boutons
function createBumpButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('bump_manual')
                .setLabel('🔄 Bump Manuel')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('bump_status')
                .setLabel('📊 Statut')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setURL('https://disboard.org/')
                .setLabel('Disboard')
                .setStyle(ButtonStyle.Link)
        );
}

// Fonction principale de bump - CORRIGÉE
async function sendBump(interaction = null) {
    try {
        console.log(`🔧 Début de la fonction sendBump...`);
        
        const channel = await client.channels.fetch(config.channelId);
        if (!channel) {
            console.error('❌ Salon non trouvé!');
            if (interaction && !interaction.replied) {
                await interaction.editReply({ content: '❌ Salon non trouvé! Vérifiez le CHANNEL_ID.' });
            }
            return;
        }

        console.log(`🕒 ${new Date().toLocaleString()} - Début du bump...`);
        lastBumpTime = new Date();
        nextBumpTime = new Date(lastBumpTime.getTime() + config.bumpInterval);

        // Si c'est une interaction, on confirme d'abord
        if (interaction && !interaction.replied) {
            await interaction.editReply({ 
                content: '✅ **BUMP IMMÉDIAT EN COURS...**' 
            });
        }

        // Envoyer le message de bump dans le salon cible
        const bumpMessage = await channel.send({
            content: `@everyone 🚀 **C'EST L'HEURE DU BUMP!** 🚀\n\nN'oubliez pas de bump le serveur avec Disboard!\nUtilisez \`/bump\` dans ce salon!`,
            embeds: [createBumpEmbed()],
            components: [createBumpButtons()]
        });

        console.log(`✅ Bump envoyé! Message ID: ${bumpMessage.id}`);
        
        // Mettre à jour le message d'interaction si c'est un bump manuel
        if (interaction && interaction.replied) {
            await interaction.editReply({ 
                content: `✅ **BUMP EFFECTUÉ AVEC SUCCÈS!**\n\nLe message a été envoyé dans <#${config.channelId}>\nProchain bump automatique: <t:${Math.floor(nextBumpTime.getTime() / 1000)}:R>` 
            });
        }

        // Reprogrammer le prochain bump si le système est actif
        if (isBumpActive) {
            scheduleNextBump();
        }

    } catch (error) {
        console.error('❌ Erreur critique lors du bump:', error);
        
        // Gérer l'erreur dans l'interaction si possible
        if (interaction) {
            if (interaction.replied) {
                await interaction.editReply({ 
                    content: `❌ **ERREUR LORS DU BUMP**\n\`\`\`${error.message}\`\`\`` 
                });
            } else {
                await interaction.reply({ 
                    content: `❌ **ERREUR LORS DU BUMP**\n\`\`\`${error.message}\`\`\``,
                    ephemeral: true 
                });
            }
        }
    }
}

// Fonction de rappel
async function sendReminder() {
    if (!isBumpActive) return;

    try {
        const channel = await client.channels.fetch(config.channelId);
        if (!channel) return;

        const now = new Date();
        const timeUntilBump = nextBumpTime - now;

        // Envoyer un rappel seulement si le prochain bump est dans moins d'1 heure
        if (timeUntilBump <= 60 * 60 * 1000) {
            const minutesLeft = Math.floor(timeUntilBump / (60 * 1000));
            
            await channel.send({
                content: `⏰ **RAPPEL BUMP**\nProchain bump dans **${minutesLeft} minutes**!\nPréparez-vous à utiliser \`/bump\` !`,
                ephemeral: false
            });
        }
    } catch (error) {
        console.error('❌ Erreur de rappel:', error);
    }
}

// Programmation du prochain bump
function scheduleNextBump() {
    // Nettoyer les anciens intervalles
    if (bumpInterval) clearInterval(bumpInterval);
    if (reminderInterval) clearInterval(reminderInterval);

    // Programmer le prochain bump
    bumpInterval = setInterval(() => sendBump(), config.bumpInterval);
    reminderInterval = setInterval(sendReminder, config.reminderInterval);
    
    console.log(`⏰ Prochain bump programmé dans 2 heures`);
}

// Démarrer le système
function startBumpSystem() {
    if (isBumpActive) {
        console.log('⚠️ Système déjà actif');
        return;
    }
    
    isBumpActive = true;
    console.log('⏰ Système de bump démarré!');
    
    // Premier bump immédiat sans interaction
    sendBump();
}

// Arrêter le système
function stopBumpSystem() {
    isBumpActive = false;
    if (bumpInterval) {
        clearInterval(bumpInterval);
        bumpInterval = null;
    }
    if (reminderInterval) {
        clearInterval(reminderInterval);
        reminderInterval = null;
    }
    nextBumpTime = null;
    
    console.log('🛑 Système de bump arrêté!');
}

// Événement quand le bot est prêt
client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} est connecté!`);
    console.log(`📝 Salon cible: ${config.channelId}`);
    registerCommands();
});

// Gestion des interactions
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButtonClick(interaction);
    }
});

// Gestion des commandes slash - CORRIGÉE
async function handleSlashCommand(interaction) {
    try {
        switch (interaction.commandName) {
            case 'bump-start':
                if (isBumpActive) {
                    await interaction.reply({ content: '⚠️ Le système de bump est déjà actif!', ephemeral: true });
                    return;
                }
                
                await interaction.reply({ 
                    content: '🟢 **DÉMARRAGE DU SYSTÈME...**',
                    ephemeral: false 
                });
                
                startBumpSystem();
                await interaction.editReply({ 
                    content: '🟢 **SYSTÈME DE BUMP DÉMARRÉ!**\n\nLe bot enverra des rappels automatiques toutes les 2 heures!\n**Premier bump envoyé immédiatement!**' 
                });
                break;

            case 'bump-stop':
                if (!isBumpActive) {
                    await interaction.reply({ content: '⚠️ Le système de bump n\'est pas actif!', ephemeral: true });
                    return;
                }
                
                stopBumpSystem();
                await interaction.reply({ 
                    content: '🔴 **SYSTÈME DE BUMP ARRÊTÉ!**\n\nLes rappels automatiques sont désactivés.',
                    ephemeral: false 
                });
                break;

            case 'bump-status':
                const statusEmbed = createBumpEmbed();
                await interaction.reply({ embeds: [statusEmbed], ephemeral: false });
                break;

            case 'bump-now':
                // Répondre immédiatement pour éviter le timeout
                await interaction.reply({ 
                    content: '🔄 **LANCEMENT DU BUMP IMMÉDIAT...**',
                    ephemeral: false 
                });
                
                // Lancer le bump avec l'interaction pour le feedback
                await sendBump(interaction);
                break;
        }
    } catch (error) {
        console.error('Erreur commande:', error);
        
        if (interaction.replied) {
            await interaction.editReply({ content: '❌ Erreur lors du traitement de la commande!' });
        } else {
            await interaction.reply({ content: '❌ Erreur lors du traitement de la commande!', ephemeral: true });
        }
    }
}

// Gestion des boutons
async function handleButtonClick(interaction) {
    try {
        switch (interaction.customId) {
            case 'bump_manual':
                await interaction.reply({ 
                    content: '📝 **BUMP MANUEL**\n\nPour bumper manuellement, utilisez la commande:\n`/bump`\n\nLe bot Disboard s\'occupera du reste!',
                    ephemeral: true 
                });
                break;

            case 'bump_status':
                const statusEmbed = createBumpEmbed();
                await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
                break;
        }
    } catch (error) {
        console.error('Erreur bouton:', error);
    }
}

// Gestion des erreurs
client.on(Events.Error, console.error);
client.on(Events.Warn, console.warn);

// Arrêt propre
process.on(['SIGINT', 'SIGTERM'], () => {
    console.log('\n🛑 Arrêt du bot...');
    stopBumpSystem();
    client.destroy();
    process.exit(0);
});

// Démarrage
console.log('🚀 Démarrage du Bump Bot...');
client.login(config.token);
