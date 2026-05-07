require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const mongoose = require("mongoose");
const { DiscordEmbed } = require("./DiscordUtils");

// 1. DATABASE CONNECTION - Syncs with BackendUtils.js
// We specify 'StumbleGuys' as the database name
mongoose.connect(process.env.mongoUri, { dbName: 'StumbleGuys' })
    .then(() => console.log("🤖 Bot Connected to StumbleGuys Database"));

// 2. USER SCHEMA - Matches BackendUtils UserModel
const UserSchema = new mongoose.Schema({
    id: Number,           // Your random 4-digit ID
    stumbleId: String,    // Your unique Stumble ID
    username: String,
    discordId: { type: String, default: null },
    gems: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false }
}, { collection: 'Users' }); // Explicitly use the 'Users' collection

const User = mongoose.model('User', UserSchema);

// 3. COMMANDS
const commands = [
    new SlashCommandBuilder().setName('link').setDescription('Link your ID').addStringOption(o => o.setName('id').setDescription('Your 4-digit ID').setRequired(true)),
    new SlashCommandBuilder().setName('changename').setDescription('Change name').addStringOption(o => o.setName('name').setDescription('New Name').setRequired(true)),
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

    // --- LINK COMMAND ---
    if (i.commandName === 'link') {
        const inputId = parseInt(i.options.getString('id'));
        const player = await User.findOne({ id: inputId });

        if (!player) return i.editReply("❌ That ID doesn't exist in the database. Log in to the game first!");
        
        player.discordId = i.user.id;
        await player.save();

        return i.editReply({ embeds: [DiscordEmbed("✅ LINK SUCCESS", `Linked ID **${inputId}** to <@${i.user.id}>`, "#00FF77", "StumbleNeo")] });
    }

    // --- CHANGENAME COMMAND ---
    if (i.commandName === 'changename') {
        const newName = i.options.getString('name');
        if (newName.length < 4 || newName.length > 12) return i.editReply("⚠️ Name must be 4-12 characters.");

        const player = await User.findOne({ discordId: i.user.id });
        if (!player) return i.editReply("❌ Link your account first with `/link`.");

        player.username = newName;
        await player.save();

        return i.editReply({ embeds: [DiscordEmbed("✅ NAME UPDATED", `New Name: **${newName}**`, "#00AAFF", "StumbleNeo")] });
    }

    if (i.commandName === 'dbping') await i.editReply(`🏓 Latency: ${client.ws.ping}ms`);
});

client.login(process.env.DISCORD_TOKEN);
