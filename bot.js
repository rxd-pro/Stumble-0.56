require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const mongoose = require("mongoose");
const { DiscordEmbed } = require("./DiscordUtils");

// 1. DATABASE CONNECTION (Sharing the same DB as index.js)
mongoose.connect(process.env.mongoUri).then(() => console.log("🤖 Bot Database Connected"));

const User = mongoose.model('User', new mongoose.Schema({
    playerId: String, 
    discordId: { type: String, default: null },
    username: String,
    gems: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: "No reason provided" }
}), 'users');

// 2. COMMAND DEFINITIONS
const commands = [
    new SlashCommandBuilder().setName('link').setDescription('Link your 4-digit ID').addStringOption(o => o.setName('id').setDescription('4-digit ID').setRequired(true)),
    new SlashCommandBuilder().setName('search').setDescription('Search player stats').addStringOption(o => o.setName('id').setDescription('4-digit ID').setRequired(true)),
    new SlashCommandBuilder().setName('dbping').setDescription('Check bot latency')
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log("🚀 StumbleNeo Bot Online!");
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply({ ephemeral: true });

    if (i.commandName === 'link') {
        const id = i.options.getString('id');
        if (id.length !== 4) return i.editReply("⚠️ ID must be 4 digits.");

        const player = await User.findOne({ playerId: id });
        if (!player) return i.editReply("❌ ID not found. Open the game first!");
        
        player.discordId = i.user.id;
        await player.save();

        const embed = DiscordEmbed("✅ LINK SUCCESS", `Linked ID **${id}** to <@${i.user.id}>`, "#00FF77", "StumbleNeo");
        await i.editReply({ embeds: [embed] });
    }

    if (i.commandName === 'dbping') {
        await i.editReply(`🏓 Latency: ${client.ws.ping}ms`);
    }
});

client.login(process.env.DISCORD_TOKEN);
