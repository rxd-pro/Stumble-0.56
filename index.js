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

        // --- THE CRITICAL FIX ---
        // Encrypt the user data so the game can read it
        const encryptedUser = CryptoUtils.Encrypt(JSON.stringify(user));
        res.json(encryptedUser); 

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
