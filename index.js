const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
ˆ
// Configuration
const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    channelId: process.env.CHANNEL_ID,
    bumpInterval: 2 * 60 * 60 * 1000, // 2 heures en millisecondes
};

// Vérification des variables d'environnement
if (!config.token) {
    console.error('❌ ERREUR: Le token Discord n\'est pas défini!');
    process.exit(1);
}

if (!config.clientId) {
    console.error('❌ ERREUR: Le Client ID n\'est pas défini!');
    process.exit(1);
}

if (!config.channelId) {
    console.error('❌ ERREUR: L\'ID du salon n\'est pas défini!');
    process.exit(1);
}

// Création du client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Variables pour le suivi
let bumpInterval = null;
let isBumpActive = false;
let lastBumpTime = null;

// Commandes slash
const commands = [
    new SlashCommandBuilder()
        .setName('start')
        .setDescription('Démarrer le bump automatique toutes les 2 heures'),
    
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Arrêter le bump automatique'),
    
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Vérifier le statut du bump automatique')
].map(command => command.toJSON());

// Enregistrement des commandes slash
const rest = new REST({ version: '10' }).setToken(config.token);

async function registerCommands() {
    try {
        console.log('🔄 Enregistrement des commandes slash...');
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands }
        );
        console.log('✅ Commandes slash enregistrées avec succès!');
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement des commandes:', error);
    }
}

// Fonction pour envoyer les commandes de bump
async function sendBumpCommands() {
    try {
        const channel = await client.channels.fetch(config.channelId);
        
        if (!channel) {
            console.error('❌ Salon non trouvé!');
            return;
        }

        console.log(`🕒 ${new Date().toLocaleString()} - Envoi des commandes de bump...`);
        lastBumpTime = new Date();
        
        // Messages à envoyer (visibles par tous)
        const bumpMessages = ['/bump', '/up'];
        
        for (const message of bumpMessages) {
            const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3 secondes
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Simuler un comportement humain en tapant
            channel.sendTyping();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Envoyer le message visible par tous
            await channel.send(message);
            console.log(`✅ Message envoyé: ${message}`);
        }
        
        console.log(`✅ Bump terminé! Prochain bump dans 2 heures.`);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi des commandes:', error);
    }
}

// Fonction pour démarrer le bump automatique
function startBumpInterval() {
    if (bumpInterval) {
        clearInterval(bumpInterval);
    }
    
    // Exécuter immédiatement
    sendBumpCommands();
    
    // Puis toutes les 2 heures
    bumpInterval = setInterval(sendBumpCommands, config.bumpInterval);
    isBumpActive = true;
    
    console.log(`⏰ Bump automatique démarré! Intervalle: 2 heures`);
}

// Fonction pour arrêter le bump automatique
function stopBumpInterval() {
    if (bumpInterval) {
        clearInterval(bumpInterval);
        bumpInterval = null;
    }
    isBumpActive = false;
    console.log('🛑 Bump automatique arrêté!');
}

// Fonction pour obtenir le statut
function getStatus() {
    const status = isBumpActive ? '🟢 ACTIF' : '🔴 INACTIF';
    const nextBump = lastBumpTime ? 
        new Date(lastBumpTime.getTime() + config.bumpInterval).toLocaleString() : 
        'Non disponible';
    
    return {
        status,
        isActive: isBumpActive,
        lastBump: lastBumpTime ? lastBumpTime.toLocaleString() : 'Aucun',
        nextBump
    };
}

// Quand le bot est prêt
client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} est connecté à Discord!`);
    console.log(`📝 Salon cible: ${config.channelId}`);
    console.log(`⏰ Intervalle de bump: 2 heures`);
    
    // Enregistrer les commandes slash
    registerCommands();
});

// Gestion des interactions (commandes slash)
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'start') {
            if (isBumpActive) {
                await interaction.reply({
                    content: '⚠️ Le bump automatique est déjà actif!',
                    ephemeral: true
                });
                return;
            }

            startBumpInterval();
            
            await interaction.reply({
                content: '🟢 **Bump automatique démarré!**\n\nLe bot enverra automatiquement `/bump` et `/up` toutes les 2 heures dans le salon #bot.\n\n**Premier bump envoyé immédiatement !**',
            });

        } else if (interaction.commandName === 'stop') {
            if (!isBumpActive) {
                await interaction.reply({
                    content: '⚠️ Le bump automatique n\'est pas actif!',
                    ephemeral: true
                });
                return;
            }

            stopBumpInterval();
            
            await interaction.reply({
                content: '🔴 **Bump automatique arrêté!**\n\nLe bot ne enverra plus de commandes automatiquement.',
                ephemeral: true
            });

        } else if (interaction.commandName === 'status') {
            const status = getStatus();
            
            const embed = {
                color: status.isActive ? 0x00FF00 : 0xFF0000,
                title: '📊 Statut du Bump Automatique',
                fields: [
                    {
                        name: '🔄 Statut',
                        value: status.status,
                        inline: true
                    },
                    {
                        name: '⏰ Dernier bump',
                        value: status.lastBump,
                        inline: true
                    },
                    {
                        name: '🕒 Prochain bump',
                        value: status.nextBump,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'RootVerse Bump Bot'
                }
            };
            
            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Erreur lors du traitement de la commande:', error);
        await interaction.reply({
            content: '❌ Une erreur est survenue lors du traitement de la commande!',
            ephemeral: true
        });
    }
});

// Gestion des erreurs
client.on(Events.Error, (error) => {
    console.error('❌ Erreur du client Discord:', error);
});

client.on(Events.Warn, (info) => {
    console.warn('⚠️ Avertissement Discord:', info);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt du bot...');
    stopBumpInterval();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Arrêt du bot (SIGTERM)...');
    stopBumpInterval();
    client.destroy();
    process.exit(0);
});

// Connexion au bot
console.log('🚀 Démarrage de RootVerse...');
client.login(config.token);
