require("dotenv").config();
const express = require("express");
const CryptoUtils = require("./CryptoUtils");
const { Database } = require("./BackendUtils");

const app = express();
const PORT = process.env.PORT || 10000;

// Setup middleware to read game data
app.use(express.json());
app.use(express.text({ type: "*/*" }));

// --- THE FIXED LOGIN ROUTE ---
app.post('/user/login', async (req, res) => {
    const { deviceId, stumbleId } = req.body;
    try {
        // Look for the user in your StumbleGuys database
        let user = await Database.collection("Users").findOne({ deviceId: deviceId });

        if (!user) {
            // Create a brand NEW ID if one doesn't exist
            const newId = Math.floor(1000 + Math.random() * 9000);
            const newUser = {
                id: newId,
                username: "NewPlayer#" + newId,
                deviceId: deviceId,
                stumbleId: stumbleId || "none",
                gems: 5000,
                isBanned: false
            };
            await Database.collection("Users").insertOne(newUser);
            user = newUser;
            console.log("✨ New User Created: " + newId);
        }

        // ENCRYPT the response so the game sound plays and you log in
        const encryptedUser = CryptoUtils.Encrypt(JSON.stringify(user));
        res.json(encryptedUser); 

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Basic check to see if server is alive
app.get("/", (req, res) => res.send("StumbleNeo Server is Live!"));

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
