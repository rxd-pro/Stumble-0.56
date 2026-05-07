require("dotenv").config();
const express = require("express");
const Console = require("./ConsoleUtils");
const CryptoUtils = require("./CryptoUtils");
const bodyParser = require('body-parser');
const AntiCheat = require('./AntiCheatUtils');
const { handlePartyUpdate } = require("./BeastRoomUtils");
const { 
    BackendUtils, UserController, RoundController, BattlePassController, 
    EconomyController, AnalyticsController, FriendsController, NewsController, 
    MissionsController, TournamentXController, MatchmakingController, 
    SocialController, EventsController, CheatController, CreatorCodeController, 
    authenticate, OnlineCheck, VerifyPhoton, getAppId, sendShared, sendADM, Database 
} = require("./BackendUtils");

const app = express();
const Title = "StumbleCore";
const PORT = process.env.PORT || 1000;
const IsMaintenanceActive = false;

app.use(express.text({ type: "*/*" }));
app.use((req, res, next) => {
    if (typeof req.body === "string") {
        try { req.body = JSON.parse(req.body); } catch {}
    }
    next();
});

app.use(express.json());

app.use((req, res, next) => {
    if (IsMaintenanceActive) {
        return res.status(503).json({ status: "Maintenance", message: "servers OFF" });
    }
    next();
});

// --- PUBLIC ROUTES (No Token Needed) ---

app.get('/version/get', (req, res) => {
    const version = '0.1';
    const encrypted = CryptoUtils.Encrypt(version);
    res.json(encrypted);
});

// FIXED LOGIN: Moved above authenticate to allow new account creation
app.post('/user/login', async (req, res) => {
    const { deviceId, stumbleId } = req.body;
    
    try {
        let user = await Database.collection("Users").findOne({ deviceId: deviceId });

        if (!user) {
            const newId = Math.floor(1000 + Math.random() * 9000);
            await Database.collection("Users").insertOne({
                id: newId,
                username: "NewPlayer#" + newId,
                deviceId: deviceId,
                stumbleId: stumbleId || "none",
                gems: 0,
                isBanned: false
            });
            user = await Database.collection("Users").findOne({ id: newId });
            console.log("✨ New User Created: " + newId);
        }
        res.json(user);
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/onlinecheck", OnlineCheck);

// --- PROTECTED ROUTES (Requires Token/Authenticate) ---

app.use(authenticate);

app.post("/party/update", handlePartyUpdate);
app.post("/photon/auth", VerifyPhoton);
app.get("/photon/get", getAppId);
app.get("/matchmaking/filter", MatchmakingController.getMatchmakingFilter);
app.get('/user/config', sendShared);
app.get('/usersettings', UserController.getSettings);
app.post('/user/updateusername', UserController.updateUsername);
app.post('/user/profile', UserController.getProfile);
app.post('/user-equipped-cosmetics/update', UserController.updateCosmetics);
app.get('/battlepass', BattlePassController.getBattlePass);
app.get("/api/v1/ping", async (req, res) => { res.status(200).send("OK"); });

// --- START SERVER ---

app.listen(PORT, () => {
    const currentDate = new Date().toLocaleString().replace(",", " |");
    console.clear();
    Console.log(`Server ${process.env.version}`, `[${Title}] | ${currentDate}`);
    Console.log(`Server ${process.env.version}`, `Current port ${PORT}`);
});
