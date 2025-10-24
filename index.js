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

// Fonction principale de bump
async function sendBump() {
    try {
        const channel = await client.channels.fetch(config.channelId);
        if (!channel) {
            console.error('❌ Salon non trouvé!');
            return;
        }

        console.log(`🕒 ${new Date().toLocaleString()} - Début du bump...`);
        lastBumpTime = new Date();
        nextBumpTime = new Date(lastBumpTime.getTime() + config.bumpInterval);

        // Envoyer le message de bump
        const bumpMessage = await channel.send({
            content: `@everyone 🚀 **C'EST L'HEURE DU BUMP!** 🚀\n\nN'oubliez pas de bump le serveur avec Disboard!\nUtilisez \`/bump\` dans ce salon!`,
            embeds: [createBumpEmbed()],
            components: [createBumpButtons()]
        });

        console.log(`✅ Bump envoyé! Prochain bump à ${nextBumpTime.toLocaleString()}`);

        // Programmer le prochain bump
        scheduleNextBump();

    } catch (error) {
        console.error('❌ Erreur lors du bump:', error);
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
    if (bumpInterval) clearInterval(bumpInterval);
    if (reminderInterval) clearInterval(reminderInterval);

    bumpInterval = setInterval(sendBump, config.bumpInterval);
    reminderInterval = setInterval(sendReminder, config.reminderInterval);
}

// Démarrer le système
function startBumpSystem() {
    if (isBumpActive) return;
    
    isBumpActive = true;
    console.log('⏰ Système de bump démarré!');
    
    // Premier bump immédiat
    sendBump();
}

// Arrêter le système
function stopBumpSystem() {
    isBumpActive = false;
    if (bumpInterval) clearInterval(bumpInterval);
    if (reminderInterval) clearInterval(reminderInterval);
    
    bumpInterval = null;
    reminderInterval = null;
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

// Gestion des commandes slash
async function handleSlashCommand(interaction) {
    try {
        switch (interaction.commandName) {
            case 'bump-start':
                if (isBumpActive) {
                    await interaction.reply({ content: '⚠️ Le système de bump est déjà actif!', ephemeral: true });
                    return;
                }
                startBumpSystem();
                await interaction.reply({ 
                    content: '🟢 **SYSTÈME DE BUMP DÉMARRÉ!**\n\nLe bot enverra des rappels automatiques toutes les 2 heures avec des notifications pour bump le serveur!',
                    ephemeral: false 
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
                await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
                break;

            case 'bump-now':
                if (!isBumpActive) {
                    await interaction.reply({ content: '⚠️ Démarrez d\'abord le système avec `/bump-start`!', ephemeral: true });
                    return;
                }
                await interaction.reply({ content: '🔄 Lancement d\'un bump immédiat...', ephemeral: true });
                await sendBump();
                break;
        }
    } catch (error) {
        console.error('Erreur commande:', error);
        await interaction.reply({ content: '❌ Erreur!', ephemeral: true });
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
