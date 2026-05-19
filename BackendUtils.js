  const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Console = require("./ConsoleUtils");
const dotenv = require('dotenv');
dotenv.config();
const CryptoUtils = require("./CryptoUtils");
const axios = require('axios');
const zlib = require('zlib');

const SharedUtils = require("./SharedUtils.js");
const SharedData = require("./shared.json");

/** Flags enviadas no login/respostas de economia; o cliente usa para ativar Workshop (UGC), mapas IPL, missões, etc. */
const STANDARD_CLIENT_FEATURE_FLAGS = [
  'age-request',
  'Consensus',
  'CustomParty',
  'EndOfMatchRewardedVideo',
  'GamePlayInGameNotifications',
  'HelpshiftConversation',
  'LocalNotifications',
  'MatchmakingFilter',
  'NewMatchmaking',
  'Pusher',
  'TournamentsX',
  'TournamentsXMeta',
  'QuantumSystemManagement',
  'RemoteLocalizations',
  'RoomManagementConsole',
  'TransferAppleIdAuthorization',
  'Events',
  'FriendsList',
  'GraphicsQualitySettings',
  'IPL_056_Dancefloor',
  'Missions'
];

function pickFinishRoundLevelIds(preferredLevelId = 'IPL_056_Dancefloor') {
  const pools = SharedData.RoundLevels_v2 || [];
  const uniqueOrdered = [];
  const seen = new Set();
  for (const level of pools) {
    const id = level && level.LevelID;
    if (id && !seen.has(id)) {
      seen.add(id);
      uniqueOrdered.push(id);
    }
  }
  if (uniqueOrdered.length === 0) {
    return ['level1_block', 'level2_block', 'level3_block'];
  }
  const primary =
    preferredLevelId && uniqueOrdered.includes(preferredLevelId)
      ? preferredLevelId
      : uniqueOrdered[0];
  const rest = uniqueOrdered.filter((lid) => lid !== primary);
  const second = rest[0] ?? primary;
  const third = rest[1] ?? second;
  return [primary, second, third];
}

class Database {
  constructor() {
    this.mongoUri = process.env.mongoUri;
    this.dbName = "StumbleGuys";
    this.client = null;
    this.db = null;
    this.collections = {
      Users: null,
      Analytics: null,
      News: null,
      Events: null,
      BattlePasses: null,
      Skins: null,
      Missions: null,
      PurchasableItems: null,
      Animations: null,
      Emotes: null,
      Footsteps: null,
      TournamentsX: null,
      Anticheat: null,
      Parties: null,
      CreatorCodes: null
    };
  }

  async connect() {
    this.client = new MongoClient(this.mongoUri);
    console.log("mongoUri:", this.mongoUri);
    await this.client.connect();
    this.db = this.client.db(this.dbName);

    this.collections.Users = this.db.collection("Users");
    this.collections.Analytics = this.db.collection("Analytics");
    this.collections.News = this.db.collection("News");
    this.collections.Events = this.db.collection("Events");
    this.collections.BattlePasses = this.db.collection("BattlePasses");
    this.collections.Skins = this.db.collection("Skins");
    this.collections.Missions = this.db.collection("Missions");
    this.collections.PurchasableItems = this.db.collection("PurchasableItems");
    this.collections.Animations = this.db.collection("Animations");
    this.collections.Emotes = this.db.collection("Emotes");
    this.collections.Footsteps = this.db.collection("Footsteps");
    this.collections.TournamentsX = this.db.collection("TournamentsX");
    this.collections.Anticheat = this.db.collection("Anticheat");
    this.collections.Parties = this.db.collection("Parties");
    this.collections.CreatorCodes = this.db.collection("CreatorCodes");
    
    await this.checkOnlineUsers()
    await this.createIndexes();
    await this.autoPopulateSharedData();


    

    Console.log("Database", "Connected to database");
  }

  async createIndexes() {
    await this.collections.Users.createIndexes([
      { key: { deviceId: 1 }, unique: true, sparse: true },
      { key: { stumbleId: 1 }, unique: true, sparse: true },
      { key: { username: 1 }, unique: true, sparse: true },
      { key: { friends: 1 } },
      { key: { sentFriendRequests: 1 } },
      { key: { receivedFriendRequests: 1 } },
      { key: { "balances.name": 1 } }
    ]);

    await this.collections.Events.createIndex({ StartDateTime: 1, EndDateTime: 1 });
    await this.collections.BattlePasses.createIndex({ PassID: 1 });
    await this.collections.Skins.createIndex({ SkinID: 1 });
  }

  async autoPopulateSharedData() {
    try {
      if (SharedData.Skins_v4?.length > 0) {
        await this.collections.Skins.deleteMany({});
        for (const skin of SharedData.Skins_v4) {
          await this.collections.Skins.insertOne({ ...skin });
        }
      }

      if (SharedData.Animations_v2?.length > 0) {
        await this.collections.Animations.deleteMany({});
        for (const anim of SharedData.Animations_v2) {
          await this.collections.Animations.insertOne({ ...anim });
        }
      }

      if (SharedData.Emotes_v2?.length > 0) {
        await this.collections.Emotes.deleteMany({});
        for (const emote of SharedData.Emotes_v2) {
          await this.collections.Emotes.insertOne({ ...emote });
        }
      }

      if (SharedData.Footsteps?.length > 0) {
        await this.collections.Footsteps.deleteMany({});
        for (const footstep of SharedData.Footsteps_v2) {
          await this.collections.Footsteps.insertOne({ ...footstep });
        }
      }
    } catch (error) {
      Console.error("Populate", "Erro ao popular coleções:", error);
    }
  }

  async autoPopulateTournaments() {
    try {
      const exists = await this.collections.TournamentsX.findOne({ id: 400 });
      if (!exists) {
        await this.collections.TournamentsX.insertOne({
          id: 1,
          type: 1,
          isEnabled: true,
          minVersion: "0.50",
          startTime: new Date("2026-05-02T10:00:00Z"),
          endTime: new Date("2026-07-01T10:00:00Z"),
          nameKey: "Block Dash 1v1 Punch Only",
          descriptionKey: "RANKED_TOURNAMENT_DESC",
          listItemBackgroundImage: "Ranked_Background_Image_Tournaments_Card",
          detailsPanelBackgroundImage: "Ranked_Background_Image_Tournaments",
          prizeBannerColour: "#0059ff",
          headerColour: "#0077ff",
          mapListGradientColourTop: "#0077ff",
          mapListGradientColourBottom: "#000e66",
          listPriority: 0,
          minPlayers: 2,
          maxPlayers: 2,
          maxBots: 0,
          minBots: 0,
          startingUsers: 2,
          maxRounds: 1,
          minMatchmakingSeconds: 0,
          entryCurrencyType: "gems",
          entryCurrencyCost: 30,
          entryCurrencyType2: "tournament_ticket_rare",
          entryCurrencyCost2: 0,
          areEmotesRestricted: false,
          prohibitedEmotes: [],
          detailsPanelBorderColourTop: "#0073ff",
          detailsPanelBorderColourBottom: "#000966",
          colourData: {
            detailsPanelMainColour: "#003dcc",
            detailsPanelBorderColour: "#0062ff",
            headerGradientRight: "#0052cc",
            headerGradientLeft: "#0044ff",
            infoWidgetsGradientRight: "#0044cc",
            infoWidgetsGradientLeft: "#004f99",
            infoWidgetsBorderColour: "#000dff"
          },
          rounds: [
            {
              roundOrder: 1,
              maxPlayersToProgress: 1,
              minPlayersPerMatch: 2,
              maxPlayersPerMatch: 2,
              maxBots: 0,
              minBots: 0,
              areLevelsRestricted: true,
              permittedLevels: ["level19_block"]
            }
          ],
          awards: [
            { placementRangeLowest: 1, placementRangeHighest: 1, awardId: 1, type: "gems", amount: 60 },
            { placementRangeLowest: 1, placementRangeHighest: 1, awardId: 10001, type: "CROWNS", amount: 1 },
            { placementRangeLowest: 1, placementRangeHighest: 1, awardId: 10002, type: "TROPHIES", amount: 10 },
            { placementRangeLowest: 1, placementRangeHighest: 1, awardId: 10003, type: "TOURNAMENTXP", amount: 1 }
          ],
          players: []
        });
      }
    } catch (err) {
      Console.error("TournamentX", "Erro ao criar torneio padrão:", err);
    }
  }

  async checkOnlineUsers() {
  const minuto = 15 * 60 * 1000
  const now = new Date()

  try {
    const onlineUsers = await this.collections.Users.find({
      lastLogin: { $gte: new Date(now - minuto) }
    }).toArray()

    if (!onlineUsers.length) return

    const userCount = onlineUsers.length

    const webhookUrl = process.env.WebhookUrl
    if (!webhookUrl) return

    const embed = {
      title: "🟢 Usuários Online",
      description: `Há **${userCount}** usuarios online nos últimos 15 minutos.`,
      color: 0x00ff00,
      footer: { text: "Beast - Status Online" },
      timestamp: new Date().toISOString()
    }

    await axios.post(webhookUrl, {
      embeds: [embed]
    })

  } catch (err) {
    console.error("Erro ao enviar webhook de usuários online:", err)
  }
}


  async getUserByQuery(query) {
    return await this.collections.Users.findOne(query);
  }

  

  async updateUser(query, updates) {
    await this.collections.Users.updateOne(query, { $set: updates });
    return await this.getUserByQuery(query);
  }

  async addToUserArray(query, arrayField, value) {
    return await this.collections.Users.updateOne(query, { $addToSet: { [arrayField]: value } });
  }

  async incrementUserBalance(query, currency, amount) {
    const user = await this.getUserByQuery(query);
    if (!user) {
        throw new Error("User not found");
    }

    const currentBalance = user.balances.find(b => b.name === currency);
    const currentAmount = currentBalance ? currentBalance.amount : 0;
    
    const newAmount = currentAmount + amount;
    const finalAmount = Math.max(0, newAmount);

    if (currentBalance) {
        const result = await this.collections.Users.updateOne(
            { ...query, "balances.name": currency },
            { $set: { "balances.$.amount": finalAmount } }
        );

        if (currency === "passTokens") {
            await this.collections.Users.updateOne(query, { 
                $set: { 
                    passTokens: finalAmount,
                    "battlePass.passTokens": finalAmount
                } 
            });
        }

        return result;
    } else if (amount > 0) {
        await this.collections.Users.updateOne(query, {
            $push: { balances: { name: currency, amount: finalAmount } }
        });

        if (currency === "passTokens") {
            await this.collections.Users.updateOne(query, { 
                $set: { 
                    passTokens: finalAmount,
                    "battlePass.passTokens": finalAmount
                } 
            });
        }
        
        return { matchedCount: 1, modifiedCount: 1 };
    } else {
        return { matchedCount: 0, modifiedCount: 0 };
    }
}

  async createUser(userData) {
    const result = await this.collections.Users.insertOne(userData);
    return { ...userData, _id: result.insertedId };
  }

  async getActiveEvents() {
    const now = new Date();
    return await this.collections.Events.find({
      StartDateTime: { $lte: now },
      EndDateTime: { $gte: now }
    }).toArray();
  }

  async getBattlePass(passId) {
    return await this.collections.BattlePasses.findOne({ PassID: passId });
  }

  async getSkinInfo(skinId) {
    return await this.collections.Skins.findOne({ SkinID: skinId });
  }

  async getMissionInfo(missionId) {
    return await this.collections.Missions.findOne({ Id: missionId });
  }

  async getPurchasableItem(itemId) {
    return await this.collections.PurchasableItems.findOne({ Name: itemId });
  }
}


const database = new Database();
database.connect().then(async () => {
  // Reset manual imediato solicitado pelo usuário
  try {
    console.log("RankedReset", "Executando reset manual imediato...");
    await database.collections.Users.updateMany(
      {},
      { 
        $set: { 
          skillRating: 0,
          crowns: 0,
          "userProfile.trophies": 0,
          "userProfile.crowns": 0,
          "passTokens": 0,
          "tournamentSeasons.0.xp": 0,
          "tournamentSeasons.0.claimedAwards": []
        } 
      }
    );
    console.log("RankedReset", "Reset manual concluído com sucesso!");
  } catch (err) {
    console.error("RankedReset", "Erro no reset manual:", err);
  }
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});

class UserModel {
  static async create(ip, deviceId, platformData = {}) {
  const now = new Date();
  const userId = Math.floor(Math.random() * 9999);
  const username = 'StumbleCore ' + CryptoUtils.GenCaracters(5).toUpperCase();
  let ipCountry = 'IN';
  let ipRegion = 'EU';
  
  try {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    if (response.data && response.data.country_code) {
      ipCountry = response.data.country_code;
      ipRegion = response.data.continent_code || 'EU';
    }
  } catch (error) {
    console.error('Erro ao detectar localização do IP:', error);
    ipCountry = 'PL';
    ipRegion = 'EU';
  }

  const user = {
    id: userId,
    deviceId,
    stumbleId: CryptoUtils.GenerateId().toUpperCase(),
    username,
    country: ipCountry,
    region: ipRegion,
    token: CryptoUtils.SessionToken(),
    version: platformData.Version || "0.1",
    ip,
    creationDate: now,
    last: now,
    newsVersion: 0,
    skillRating: 0,
    experience: 0,
    crowns: 0,
    hiddenRating: 0,
    isBanned: false,
    inventory: [{
      userId,
      itemId: 803,
      itemType: "DUPLICATE_BANK",
      item: "CONFIG_VERSION",
      amount: 3
    }],
    skins: ["SKIN1", "SKIN2"],
    emotes: ["emote_cry", "emote_hi", "emote_gg", "emote_haha", "emote_happy"],
    animations: ["animation1"],
    footsteps: ["footsteps_smoke"],
    friends: [],
    sentFriendRequests: [],
    receivedFriendRequests: [],
    hasBattlePass: false,
    passTokens: 0,
    freePassRewards: [],
    premiumPassRewards: [],
    balances: [
      { name: "coins", amount: 101, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "remove_ads", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 2, lastGiven: now },
      { name: "video", amount: 50, secondsSince: 0, secondsPerUnit: 0, maxAmount: 5000, lastGiven: now },
      { name: "gems", amount: 10000, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "video_gems", amount: 10, secondsSince: 0, secondsPerUnit: 5400, maxAmount: 10, lastGiven: now },
      { name: "video_coins", amount: 8, secondsSince: 0, secondsPerUnit: 10800, maxAmount: 8, lastGiven: now },
      { name: "special_video", amount: 3, secondsSince: 0, secondsPerUnit: 28800, maxAmount: 3, lastGiven: now },
      { name: "skin_charge", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 5, lastGiven: now },
      { name: "skin_purchase", amount: 7, secondsSince: 0, secondsPerUnit: 86400, maxAmount: 7, lastGiven: now },
      { name: "gem_charge", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 3, lastGiven: now },
      { name: "gem_purchase", amount: 1, secondsSince: 0, secondsPerUnit: 86400, maxAmount: 1, lastGiven: now },
      { name: "dust", amount: 500, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "default_free_spins", amount: 1, secondsSince: 0, secondsPerUnit: 0, maxAmount: 1, lastGiven: new Date(Date.now() - 86400000) },
      { name: "default_free_ad_spins", amount: 16, secondsSince: 0, secondsPerUnit: 0, maxAmount: 16, lastGiven: new Date(Date.now() - 86400000) },
      { name: "remove_interstitial_ads", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 2, lastGiven: now },
      { name: "end_of_match", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 1, lastGiven: now },
      { name: "end_of_match_event", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 1, lastGiven: now },
      { name: "tournament_ticket_rare", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "tournament_ticket_legendary", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "video_coins_02", amount: 5, secondsSince: 0, secondsPerUnit: 28800, maxAmount: 5, lastGiven: now },
      { name: "aes", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "aec", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "ranked_friend_boost", amount: 3, secondsSince: 0, secondsPerUnit: 86400, maxAmount: 3, lastGiven: now },
      { name: "stumble_coins", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now },
      { name: "dust_backup", amount: 0, secondsSince: 0, secondsPerUnit: 0, maxAmount: 0, lastGiven: now }
    ],
    Rewards: [],
    availableNewsVersion: 0,
    latestNewsIdBackend: 11698,
    battlePass: {
      freePassRewards: [],
      premiumPassRewards: [],
      passTokens: 0,
      hasPurchased: false,
      passID: 1,
      secondsToEnd: 904064,
      experience: 0,
      slotsClaimed: [],
      hasUsedDiscount: false,
      xpBooster: 0,
      coins: 0,
      hasUsedBonusDiscount: false,
      passDateId: 0
    },
    secondsSinceCreated: 0,
    age: 0,
    kidFriendlyMode: 0,
    termsOfServiceVersion: 0,
    xpRoad: {
      userId,
      xpRoadId: 0,
      lastClaimedLevel: 1,
      isVeteran: true,
      claimedRewardsIds: [],
      hasBeenEnabled: true,
      currentLevelCap: 70,
      isOnboarding: false,
      onboardingFeaturesUnlocked: []
    },
    userFlags: {
      hasUsedFreeNameChange: false,
      hasCoinConversionPopupShown: false,
      hasCoinConversionCompleted: false
    },
    offerSequenceState: [],
    userProfile: {
      userId,
      userName: username,
      country: ipCountry,
      trophies: 0,
      crowns: 0,
      experience: 0,
      hiddenRating: 0,
      isOnline: true,
      lastSeenDate: now.toISOString(),
      skin: "SKIN1",
      nativePlatformName: platformData.Platform || platformData.NativePlatformName || "android",
      ranked: UserModel.getRankedObject(0),
      flags: 0
    },
    featureFlags: [
      'TournamentsX',
      'TournamentsXMeta',
      'Events',
      'FriendsList',
      'GraphicsQualitySettings'
    ],
    googleId: platformData.googleId || '',
    facebookId: platformData.facebookId || '',
    appleId: platformData.appleId || '',
    scopelyId: platformData.scopelyId || '',
    steamTicket: platformData.steamTicket || '',
    equippedCosmetics: {
      skin: 'SKIN1',
      color: 'COLOR1',
      animation: 'animation1',
      footsteps: 'footsteps_smoke',
      emote1: 'emote_cry',
      emote2: 'emote_hi',
      emote3: 'emote_gg',
      emote4: 'emote_haha',
      actionEmote1: 1,
      actionEmote2: 2,
      actionEmote3: 3,
      actionEmote4: 4
    },
    tournamentSeasons: [
      {
        seasonId: 1,
        xp: 0,
        claimedAwards: []
      }
    ]
  };

  return await database.createUser(user);
}
 

  static async findByDeviceId(deviceId) {
    return await database.getUserByQuery({ deviceId });
  }

  static async findByStumbleId(stumbleId) {
    return await database.getUserByQuery({ stumbleId });
  }

  static async findById(id) {
    return await database.getUserByQuery({ id: parseInt(id) });
  }

  static async update(stumbleId, updates) {
    return await database.updateUser({ stumbleId }, updates);
  }

  static async addBalance(deviceId, currency, amount) {
    return await database.incrementUserBalance({ deviceId }, currency, amount);
  }

  static async removeBalance(deviceId, currency, amount) {
    return await database.incrementUserBalance({ deviceId }, currency, -amount);
  }

  static async addSkin(stumbleId, skinId) {
    return await database.addToUserArray({ stumbleId }, 'skins', skinId);
  }

  static async addActionEmote(stumbleId, emoteId) {
    return await database.addToUserArray({ stumbleId }, 'actionEmotes', emoteId);
  }

  static async setEquippedCosmetic(stumbleId, cosmeticType, cosmeticId) {
    const user = await this.findByStumbleId(stumbleId);
    if (!user) throw new Error("User not found");

    const updatedCosmetics = { ...user.equippedCosmetics, [cosmeticType]: cosmeticId };
    return await this.update(stumbleId, { equippedCosmetics: updatedCosmetics });
  }

  static async claimBattlePassSlot(deviceId, slotKey) {
    const user = await this.findByDeviceId(deviceId);
    if (user.battlePass.slotsClaimed.includes(slotKey)) {
      throw new Error("Slot already claimed");
    }

    await database.collections.Users.updateOne(
      { deviceId },
      { $push: { 'battlePass.slotsClaimed': slotKey } }
    );
    return await this.findByDeviceId(deviceId);
  }

  static async addBattlePassExperience(deviceId, xpToAdd) {
    const user = await this.findByDeviceId(deviceId);
    const newXP = (user.battlePass.experience || 0) + xpToAdd;

    await database.collections.Users.updateOne(
      { deviceId },
      { $set: { 'battlePass.experience': newXP } }
    );

    return await this.findByDeviceId(deviceId);
  }

  static getRankData(skillRating) {
    const ranks = [
      { id: 1, thresholds: [0, 250, 500], next: 750 },
      { id: 2, thresholds: [750, 1100, 1450], next: 1800 },
      { id: 3, thresholds: [1800, 2250, 2700], next: 3150 },
      { id: 4, thresholds: [3150, 3650, 4150], next: 4650 },
      { id: 5, thresholds: [4650, 5250, 5850], next: 6450 },
      { id: 6, thresholds: [6450, 7100, 7750], next: 8400 },
      { id: 7, thresholds: [8400, 9200, 10000], next: Infinity }
    ];

    for (let i = 0; i < ranks.length; i++) {
      const rank = ranks[i];
      if (skillRating < rank.next) {
        let tierIndex = 0;
        for (let j = rank.thresholds.length - 1; j >= 0; j--) {
          if (skillRating >= rank.thresholds[j]) {
            tierIndex = j;
            break;
          }
        }
        return { rankId: rank.id, tierIndex };
      }
    }
    return { rankId: 7, tierIndex: 2 };
  }

  static getRankedObject(skillRating) {
    const { rankId, tierIndex } = this.getRankData(skillRating || 0);
    return {
      currentSeasonId: "LIVE_RANKED_SEASON_12",
      currentRankId: rankId,
      currentTierIndex: tierIndex
    };
  }

  static getRankAssets(rankId) {
    const rankAssets = {
      1: { name: "1v1 Super Slide", cardImage: "Ranked_Background_Image_Tournaments_Card", hubImage: "Ranked_Background_Image_Tournaments" },
      2: { name: "Ranked Bronze", cardImage: "Ranked_Background_Image_Tournaments_Card_Bronze", hubImage: "Ranked_Background_Image_Tournaments_Bronze" },
      3: { name: "Ranked Silver", cardImage: "Ranked_Background_Image_Tournaments_Card_Silver", hubImage: "Ranked_Background_Image_Tournaments_Silver" },
      4: { name: "Ranked Gold", cardImage: "Ranked_Background_Image_Tournaments_Card_Gold", hubImage: "Ranked_Background_Image_Tournaments_Gold" },
      5: { name: "Ranked Platinum", cardImage: "Ranked_Background_Image_Tournaments_Card_Platinum", hubImage: "Ranked_Background_Image_Tournaments_Platinum" },
      6: { name: "Ranked Master", cardImage: "Ranked_Background_Image_Tournaments_Card_Master", hubImage: "Ranked_Background_Image_Tournaments_Master" },
      7: { name: "Ranked Champion", cardImage: "Ranked_Background_Image_Tournaments_Card_Champion", hubImage: "Ranked_Background_Image_Tournaments_Champion" }
    };
    return rankAssets[rankId] || rankAssets[1];
  }

  static async GetHighscore(type, country, start = 0, count = 50) {
    const filter = {};
    const projection = { username: 1, country: 1, _id: 0 };
    let sortField;
    let valueField;

    if (type === "crowns") {
      filter.crowns = { $gt: 0 };
      projection.crowns = 1;
      sortField = "crowns";
      valueField = "Crowns";
    } else if (type === "rank") {
      filter.skillRating = { $gt: 0 };
      projection.skillRating = 1;
      sortField = "skillRating";
      valueField = "SkillRating";
    } else if (type === "tournaments") {
      filter.passTokens = { $gt: 0 };
      projection.passTokens = 1;
      sortField = "passTokens";
      valueField = "Points";
    }

    if (country && country.toLowerCase() !== "global" && country !== "") {
      filter.country = country;
    }

    const users = await database.collections.Users
      .find(filter)
      .sort({ [sortField]: -1 })
      .project(projection)
      .skip(parseInt(start))
      .limit(parseInt(count))
      .toArray();


    const scores = users.map(user => {
      let value;
      let extraFields = {};

      if (type === "crowns") {
        value = user.crowns;
      } else if (type === "rank") {
        value = user.skillRating;
      } else if (type === "tournaments") {
        value = user.passTokens;
        extraFields.Emoji = "Tournament_Medal_Icon";
      }

      return {
        User: {
          Username: user.username,
          Country: user.country || "Unknown",
          [valueField]: value,
          ...extraFields
        }
      };
    });

    return { scores };
  }

  static async getBalanceAmount(user, currency) {
    const balance = user.balances.find(b => b.name === currency);
    return balance ? balance.amount : 0;
  }

  static async getLevel(xp) {
    return Math.floor((xp + 1032700) / 30000) - 9;
  }
}



  async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    req.user = null;

    if (req.path == "/user/login" || req.path == "/user/config" || req.path == "/photon/get" || req.path == "/onlinecheck" || req.path.startsWith("/shared/") || req.path == "/api/v1/ping" || req.path == "/version/get") {
      return next();
    }
   
     if (!authHeader)
    {
      return res.status(401).json("404: Invalid URL");
    } 
 
    let authData = {};
    try {
      authData = JSON.parse(authHeader);
      if (authData && authData.Encrypted) {
        const decrypted = CryptoUtils.Decrypt(authData.Encrypted);
        authData = JSON.parse(decrypted);
      }
    } catch (e) { 
      try {
        const decrypted = CryptoUtils.Decrypt(authHeader);
        authData = JSON.parse(decrypted);
      } catch (err) {
        Console.error("Auth", "Error parsing authorization header:", e);
        return next();
      }
    }

    const deviceId = authData.DeviceId || "";
    const stumbleId = authData.StumbleId || "";
    const token = authData.Token || "";
    const hash = authData.Hash || "";
    const username = authData.Username || "";
    const id = authData.Id || "";


    const expectedHash = CryptoUtils.CreateRegularHash(
      username,
      id,
      deviceId,
      token,
      stumbleId,
      req.path,
      JSON.stringify(req.body)
    );

     /* if (hash !== expectedHash) {
      console.log("hash errada hahaha q otaro " + expectedHash);
      return res.status(401).json("UNAUTHORIZED");
     } */

    let user = stumbleId 
      ? await UserModel.findByStumbleId(stumbleId)
      : await UserModel.findByDeviceId(deviceId);

     if (!user) {
      Console.log("Auth", `User not found: DeviceId=${deviceId}, StumbleId=${stumbleId}`);
      Console.log("Auth", `User not found: ${expectedHash}`);
      return res.status(404).json("usuario nao encontrado");
    }

    if (user.isBanned)
    {
        return res.status(403).json("BANNED");
    }

    req.user = user;

    Console.log("Auth", `Authenticated user: ${user.username}`);
    next();
  } catch (err) {
    Console.error("Auth", "Error:", err);
    res.status(401).json("UNAUTHORIZED");
  }
}



async function generatePhotonJwt(user) {
  const payload = {
    stumbleId: user.stumbleId,
    deviceId: user.deviceId,
    username: user.username
  };

  const secret = process.env.Salt;
  const options = { expiresIn: '30d', issuer: 'JWTPhoton' };

  return new Promise((resolve, reject) => {
    jwt.sign(payload, secret, options, (err, token) => {
      if (err) reject(err);
      else resolve(token);
    });
  });
}



async function VerifyPhoton(req, res, user) {
  try {
    const tokenFromHeader = req.headers.authorization;
    if (!tokenFromHeader) {
      return res.json({ ResultCode: -1, Message: "Authorization header missing" });
    }

    try {
      const secret = process.env.Salt;
      const decoded = jwt.verify(tokenFromHeader, secret);
      
      if (decoded.stumbleId !== user.stumbleId || 
          decoded.deviceId !== user.deviceId || 
          decoded.username !== user.username) {
        return res.json({ ResultCode: -1, Message: "Token validation failed" });
      }

      return res.json({ ResultCode: 1, UserId: tokenFromHeader });
    } catch (err) {
      return res.json({ ResultCode: -1, Message: "Invalid token" });
    }
  } catch (err) {
    Console.error("VerifyPhoon", "Error:", err);
    return res.status(500).json({ ResultCode: -1, Message: "Internal server error" });
  }
}



class UserController {
  static loginAttempts = new Map();
  static bannedIPs = new Map();
  static bannedDevices = new Map();


static async login(req, res) {
    try {
      const { DeviceId, StumbleId, Version, Platform, NativePlatformName } = req.body;
      if (!DeviceId) return res.status(400).json({ error: 'deviceid required' });

      const clientIp = req.header["x-real-ip"];
      
      if (UserController.bannedIPs.has(clientIp)) {
        const banInfo = UserController.bannedIPs.get(clientIp);
        if (Date.now() < banInfo.until) {
          return res.status(429).json({ error: 'a' });
        }
        UserController.bannedIPs.delete(clientIp);
      }

      if (UserController.bannedDevices.has(DeviceId)) {
        const banInfo = UserController.bannedDevices.get(DeviceId);
        if (Date.now() < banInfo.until) {
          return res.status(429).json({ error: 'a' });
        }
        UserController.bannedDevices.delete(DeviceId);
      }

      let user = await UserModel.findByStumbleId(StumbleId);
      if (!user) user = await UserModel.findByDeviceId(DeviceId);

      if (!user) {
        const now = Date.now();
        const attempts = UserController.loginAttempts.get(clientIp) || { count: 0, lastAttempt: now, deviceAttempts: {} };
        
        if (now - attempts.lastAttempt > 60000) {
          attempts.count = 0;
          attempts.deviceAttempts = {};
        }
        
        attempts.count++;
        attempts.lastAttempt = now;
        
        if (!attempts.deviceAttempts[DeviceId]) {
          attempts.deviceAttempts[DeviceId] = 1;
        } else {
          attempts.deviceAttempts[DeviceId]++;
        }
        
        UserController.loginAttempts.set(clientIp, attempts);
        
        if (attempts.count > 5 || attempts.deviceAttempts[DeviceId] > 3) {
          UserController.bannedIPs.set(clientIp, {
            until: now + 15 * 60 * 1000,
            bannedAt: now
          });
          
          UserController.bannedDevices.set(DeviceId, {
            until: now + 15 * 60 * 1000,
            bannedAt: now
          });
          
          return res.status(429).json({ error: 'a' });
        }
        
        user = await UserModel.create(req.ip, DeviceId, { Version, Platform, NativePlatformName });
      } else {
        if (user.isBanned) return res.status(403).json("BANNED");
        
        UserController.loginAttempts.delete(clientIp);
        
        user = await UserModel.update(user.stumbleId, {
          lastLogin: new Date(),
          version: Version,
          "userProfile.ranked": UserModel.getRankedObject(user.skillRating || 0)
        });
      }

      const token = CryptoUtils.SessionToken();
      const photonJwt = await generatePhotonJwt(user);

      user = await UserModel.update(user.stumbleId, { token, photonJwt });

      const featureFlags = [
        'CustomParty',
        'NewMatchmaking',
        'TournamentsX',
        'TournamentsXMeta',
        'Events',
        'FriendsList',
        'GraphicsQualitySettings',
        'IPL_056_Dancefloor'
      ]
      Console.log("Login", "User Logged: " + user.username);
      return res.status(200).json({
        User: user,
        PhotonJwt: photonJwt,
        FeatureFlags: featureFlags
      });

    } catch (err) {
      Console.error('Login', 'Error:', err);
      return res.status(500).json({ error: 'internal server error' });
    }
  }

  static async getConfig(req, res) {
    try {
      const config = {
        _SharedVersion: SharedData._SharedVersion || 14384,
        Versions: {
          AndroidLastVersionAvailable: "9.99",
          IOSLastVersionAvailable: "9.99",
          SteamLastVersionAvailable: "9.99",
          MinimumVersionToPlay: "0.1",
          Max: "9.99",
          Min: "0.1"
        },
        BattlePassRotation: SharedData.BattlePassRotation || [],
        BattlePassesV3: SharedData.BattlePassesV3 || SharedData.BattlePasses || [],
        RoundLevels_v2: SharedData.RoundLevels_v2 || [],
        Skins_v4: SharedData.Skins_v4 || [],
        MissionObjectives: SharedData.MissionObjectives || [],
        PurchasableItems: SharedData.PurchasableItems || [],
        GameEvents: SharedData.GameEvents || [],
        Animations: SharedData.Animations || [],
        Animations_v2: SharedData.Animations_v2 || [],
        AdSettings: SharedData.AdSettings || {},
        AnalyticsSettings: SharedData.AnalyticsSettings || {},
        BackendUrl: process.env.BACKEND_URL || "https://stumblezone-production.up.railway.app",
        BattlePass: SharedData.BattlePass || {},
        ActionEmotes: SharedData.ActionEmotes || {},
        RankedPlaySettings: SharedData.RankedPlaySettings || {},
        Missions: SharedData.Missions || [],
        WorkshopSettings: SharedData.WorkshopSettings || { Enabled: true },
        NewsVersion: 2,
        AvailableNewsVersion: 2,
        FeatureFlags: [
          { "Flag": "IPL_056_Dancefloor", "Enabled": true },
          { "Flag": "FriendsList", "Enabled": true },
          { "Flag": "TournamentsX", "Enabled": true },
          { "Flag": "Events", "Enabled": true },
          { "Flag": "News", "Enabled": true },
          { "Flag": "CustomParty", "Enabled": true },
          { "Flag": "NewMatchmaking", "Enabled": true }
        ],
        FeatureFlag: [
          "Missions",
          "FriendsList",
          "TournamentsX",
          "Events",
          "News",
          "CustomParty",
          "NewMatchmaking",
          "IPL_056_Dancefloor"
        ]
      };

      res.json(config);
    } catch (err) {
      Console.error('Config', 'Error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
   
    static async updateUsername(req, res) {
  try {
    const { Username } = req.body;
    const { user } = req;

    if (!Username || Username.length < 4 || Username.length > 12) {
      return res.status(401).json({ message: 'Username can only have between 4 and 12 characters.' });
    }

    if (/[{}()"'`~#$%^&*=+\\\/|:;,?!]/.test(Username)) {
      return res.status(403).json({ message: 'invalid characters' });
    }

    const existingUser = await database.getUserByQuery({ username: Username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    const tagItems = user.inventory
      ? user.inventory.filter(i => i.itemType === "TAG" && typeof i.item === "string")
      : [];

    const tagsToAdd = tagItems.map(t => {
      let tag = t.item.replace(/^tag_/, '');
      if (t.amount > 1) tag += `+${t.amount}`;
      return tag;
    });

    let finalUsername = Username;

    if (tagsToAdd.length > 0) {
      finalUsername += " " + tagsToAdd.join(" ");
    }

    const oldNames = Array.isArray(user.oldNames) ? user.oldNames : [];
    oldNames.push({
      name: user.username,
      changedAt: new Date()
    });

    const updates = {
      username: finalUsername,
      "userProfile.userName": finalUsername,
      oldNames: oldNames
    };

    const updatedUser = await UserModel.update(user.stumbleId, updates);
    await UserModel.removeBalance(user.deviceId, "gems", 100);

    console.log(`${user.username} changed username to ${finalUsername}`);

    res.status(200).json({ User: updatedUser });

  } catch (err) {
    console.error("error updating username:", err);
    res.status(500).json({ message: "internal server error" });
  }
}




  static async getSettings(req, res) {
    try {
        const settings = {
            friendIsOnlinePush: true,
            invitedToPartyPush: true,
            partyInviteToastNotification: true,
            partyInviteInGameToastNotification: true
        };
        
        res.json(settings);
    } catch (err) {
        Console.error('Settings', 'Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

  static async getProfile(req, res) {
    try {
      const { userID } = req.body;
      let user = null;

      if (userID) {
        user = await UserModel.findById(userID);
      }

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const userProfile = { ...user.userProfile, isOnline: true };

      res.json({ 
        User: userProfile
      });
    } catch (err) {
      Console.error('Profile', 'Get error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async addSkin(req, res) {
    try {
      const { user } = req;
      const { skinId } = req.body;

     console.log("skin", req.body);

      if (!skinId) {
        return res.status(400).json({ message: 'skinId is required' });
      }

      await UserModel.addSkin(user.stumbleId, skinId);
      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      res.json({ User: updatedUser });
    } catch (err) {
      Console.error('Cosmetics', 'Add skin error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async setEquippedCosmetic(req, res) {
    try {
        const { user } = req;
        const { Category, ItemId } = req.body;

        if (!Category || !ItemId) {
            return res.status(400).json({ message: 'falta algo' });
        }

        const updates = {
            equippedCosmetics: {
                ...user.equippedCosmetics,
                [Category]: ItemId
            }
        };

        if (Category === 'Skin') {
            updates['userProfile.skin'] = ItemId;
        }

        const updatedUser = await database.updateUser({ stumbleId: user.stumbleId }, updates);
        res.json({ User: updatedUser });
    } catch (err) {
        Console.error('Cosmetics', 'erro ao setar cosméticos:', err);
        res.status(500).json({ message: 'erro' });
    }
}
   
   
 static async getHighscore(req, res, next) {
  try {
    const { type } = req.params;
    const { start = 0, count = 100, country = 'global' } = req.query;

    const startNum = parseInt(start, 10);
    const countNum = parseInt(count, 10);

    if (!type) {
      return res.status(400).json({ error: "O tipo é necessário" });
    }

    if (isNaN(startNum) || isNaN(countNum)) {
      return res.status(400).json({ error: "Os parâmetros start e count devem ser números" });
    }

    const result = await UserModel.GetHighscore(type, country, startNum, countNum);

    res.json(result);
  } catch (err) {
    next(err);
  }
   }

  static async updateCosmetics(req, res) {
    try {
      const { user } = req;
      const { 
        skin, color, animation, footsteps, 
        emote1, emote2, emote3, emote4,
        actionEmote1, actionEmote2, actionEmote3, actionEmote4 
      } = req.body;

      const updates = {
        equippedCosmetics: {
          skin: skin || user.equippedCosmetics.skin,
          color: color || user.equippedCosmetics.color,
          animation: animation || user.equippedCosmetics.animation,
          footsteps: footsteps || user.equippedCosmetics.footsteps,
          emote1: emote1 || user.equippedCosmetics.emote1,
          emote2: emote2 || user.equippedCosmetics.emote2,
          emote3: emote3 || user.equippedCosmetics.emote3,
          emote4: emote4 || user.equippedCosmetics.emote4,
          actionEmote1: actionEmote1 || user.equippedCosmetics.actionEmote1,
          actionEmote2: actionEmote2 || user.equippedCosmetics.actionEmote2,
          actionEmote3: actionEmote3 || user.equippedCosmetics.actionEmote3,
          actionEmote4: actionEmote4 || user.equippedCosmetics.actionEmote4
        }
      };

      const updatedUser = await UserModel.update(user.stumbleId, updates);
      res.json({ User: updatedUser });
    } catch (err) {
      Console.error('Cosmetics', 'Update error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async deleteAccount(req, res) {
    try {
      const { user } = req;
      const newUsername = `#${CryptoUtils.GenCaracters(11)}`;
      
      await UserModel.update(user.deviceId, { username: newUsername });
      await database.collections.Users.deleteOne({ deviceId: user.deviceId });
      
      res.json({ message: 'server error' });
    } catch (err) {
      Console.error('Account', 'Delete error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async linkPlatform(req, res) {
    try {
      const { platform, platformId } = req.body;
      const { user } = req;
      
      const validPlatforms = ['google', 'apple', 'facebook', 'scopely', 'steam'];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({ message: 'Invalid platform' });
      }

      const platformIdMD5 = CryptoUtils.Hash('md5', platformId || `${platform}-${user.username}-${process.env.Salt}`);
      const updateField = `${platform}Id`;

      const updatedUser = await UserModel.update(user.deviceId, { [updateField]: platformIdMD5 });
      res.json({ User: updatedUser, message: `Successfully linked ${platform} account` });
    } catch (err) {
      Console.error('Platform', 'Link error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async unlinkPlatform(req, res) {
    try {
      const { platform } = req.body;
      const { user } = req;
      
      const validPlatforms = ['google', 'apple', 'facebook', 'scopely', 'steam'];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({ message: 'Invalid platform' });
      }

      const updateField = `${platform}Id`;
      const updatedUser = await UserModel.update(user.deviceId, { [updateField]: '' });
      
      res.json({ User: updatedUser, message: `Successfully unlinked ${platform} account` });
    } catch (err) {
      Console.error('Platform', 'Unlink error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

class RoundController {
  static async finishRound(req, res) {
    try {
      const { user } = req;
      const { Round } = req.body;


      const rewards = {
        crowns: Round === '3' ? 1 : Round === '2' ? 0 : 0,
        skillRating: Round === '3' ? 20 : Round === '2' ? 10 : 0,
        experience: 100,
        tournamentXp: Round === '3' ? 25 : 5
      };

      const currentXp = (user.tournamentSeasons && user.tournamentSeasons[0]?.xp) || 0;

      const updatedUser = await UserModel.update(user.deviceId, {
        crowns: user.crowns + rewards.crowns,
        skillRating: user.skillRating + rewards.skillRating,
        experience: user.experience + rewards.experience,
        "tournamentSeasons.0.xp": currentXp + rewards.tournamentXp
      });

      res.status(200).json({
        Rewards: rewards
      });
    } catch (err) {
      Console.error('Round', 'Finish error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async finishCustomRound(req, res) {
    try {
      const { user } = req;
      const { round } = req.params;
Console.log('Round', `Finishing custom round: ${round} for user: ${user.username}`);
      res.json({
        User: user,
        message: 'Custom round finished successfully'
      });
    } catch (err) {
      Console.error('Round', 'Custom finish error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async finishRoundV4(req, res) {
    try {
      const { user } = req;
      const { round } = req.params;
      const { gameType, variantId } = req.body;

      const gameId = CryptoUtils.CreateGameId(gameType === 'event' ? 'event' : 'regular');
      const levelIds = SharedData.RoundLevels_v2.map(level => level.LevelID).slice(0, 3);

      const roundPayloads = {};
      const placements = {};
      const eliminatedPlayers = [];
      const usersLastRound = {};

      if (round === '1') {
        placements[user.id] = 16;
        usersLastRound[user.id] = 1;
        roundPayloads[1] = {
          EliminatedPlayers: [user.id, ...Array(15).fill(0).map((_, i) => 1000 + i)],
          LevelId: levelIds[0],
          Placements: placements,
          RoundMissionProgression: null,
          Type: "SoloRound"
        };
      } else if (round === '2') {
        placements[user.id] = 8;
        usersLastRound[user.id] = 2;
        roundPayloads[1] = {
          EliminatedPlayers: [],
          LevelId: levelIds[0],
          Placements: placements,
          RoundMissionProgression: null,
          Type: "SoloRound"
        };
        roundPayloads[2] = {
          EliminatedPlayers: [user.id, ...Array(7).fill(0).map((_, i) => 1000 + i)],
          LevelId: levelIds[1],
          Placements: placements,
          RoundMissionProgression: null,
          Type: "SoloRound"
        };
      } else if (round === '3') {
        placements[user.id] = 1;
        usersLastRound[user.id] = 3;
        roundPayloads[1] = {
          EliminatedPlayers: [],
          LevelId: levelIds[0],
          Placements: placements,
          RoundMissionProgression: null,
          Type: "SoloRound"
        };
        roundPayloads[2] = {
          EliminatedPlayers: [],
          LevelId: levelIds[1],
          Placements: placements,
          RoundMissionProgression: null,
          Type: "SoloRound"
        };
        roundPayloads[3] = {
          EliminatedPlayers: [],
          LevelId: levelIds[2],
          Placements: placements,
          RoundMissionProgression: null,
          Type: "SoloRound"
        };
      }

      const clientViewPayload = {
        AverageMmr: null,
        CurrentRound: parseInt(round),
        ExpectedRounds: 3,
        FrameNumber: 7814,
        GameId: gameId,
        GameType: gameType === 'event' ? "Event" : "Regular",
        Placements: null,
        RoundPayloads: roundPayloads,
        StartingUsers: 32,
        UsersLastRound: usersLastRound,
        VariantId: variantId || null
      };

      const rewards = {
        crowns: round === '3' ? 1 : round === '2' ? 0 : 0,
        skillRating: round === '3' ? 20 : round === '2' ? 10 : 0,
        experience: 100,
        tournamentXp: round === '3' ? 25 : 5
      };

      const currentXp = (user.tournamentSeasons && user.tournamentSeasons[0]?.xp) || 0;

      const updatedUser = await UserModel.update(user.deviceId, {
        crowns: user.crowns + rewards.crowns,
        skillRating: user.skillRating + rewards.skillRating,
        experience: user.experience + rewards.experience,
        "tournamentSeasons.0.xp": currentXp + rewards.tournamentXp
      });

      res.status(200).json({
        ClientViewPayload: clientViewPayload,
        ClientViewPlacements: null,
        FriendsCount: 0,
        LevelIds: levelIds,
        MissionsProgression: {},
        SignedPayload: "",
        User: updatedUser,
        Rewards: rewards
      });
    } catch (err) {
      Console.error('Round', 'FinishV4 error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async finishEventRoundV3(req, res) {
    try {
      const { user } = req;
      const { region, appid, jwt, eventId } = req.params;
      const finishReq = req.body || {};

      if (!eventId) {
        return res.status(400).json({ message: "eventId requerido" });
      }

      const events = SharedData.GameEvents || [];
      const event = events.find(e => e.Id === eventId);
      if (!event) {
        return res.status(404).json({ message: "evento nao encontrado" });
      }

      const now = new Date();
      const start = new Date(event.StartDateTime);
      const end = new Date(event.EndDateTime);
      if (!(start <= now && now <= end)) {
        return res.status(400).json({ message: "evento nao esta ativo" });
      }

      const roundNumber = parseInt(finishReq.Round ?? finishReq.round);
      if (isNaN(roundNumber)) {
        return res.status(400).json({ message: "round invalido" });
      }

      const roundDef = Array.isArray(event.EventRounds)
        ? event.EventRounds.find(r => r.RoundNumber === roundNumber) || event.EventRounds[0]
        : null;

      if (!roundDef) {
        return res.status(400).json({ message: "round nao configurado para evento" });
      }

      let xp = 0;
      let passTokens = 0;
      let trophies = 0;
      let crowns = 0;
      let hiddenRatingDelta = 0;

      const rewardsList = Array.isArray(roundDef.RoundRewards) ? roundDef.RoundRewards : [];
      for (const r of rewardsList) {
        const amount = typeof r.max === "number" ? r.max : (typeof r.min === "number" ? r.min : 0);
        if (r.type === "XP") xp += amount;
        else if (r.type === "PASSTOKENS") passTokens += amount;
        else if (r.type === "TROPHIES") trophies += amount;
        else if (r.type === "CROWNS") crowns += amount;
      }

      const winnerRewardsList = Array.isArray(event.WinnerRewards?.Rewards) ? event.WinnerRewards.Rewards : [];
      for (const r of winnerRewardsList) {
        const amount = typeof r.max === "number" ? r.max : (typeof r.min === "number" ? r.min : 0);
        if (r.type === "XP") xp += amount;
        else if (r.type === "PASSTOKENS") passTokens += amount;
        else if (r.type === "TROPHIES") trophies += amount;
        else if (r.type === "CROWNS") crowns += amount;
      }
      if (typeof event.WinnerHiddenRating === "number") {
        hiddenRatingDelta += event.WinnerHiddenRating;
      }

      const currentCrowns = parseInt(user.userProfile?.crowns ?? user.crowns ?? 0) || 0;
      const currentExperience = parseInt(user.userProfile?.experience ?? user.experience ?? 0) || 0;
      const currentTrophies = parseInt(user.userProfile?.trophies ?? 0) || 0;
      const currentSkill = parseInt(user.skillRating ?? 0) || 0;
      const currentPassTokens = parseInt(user.battlePass?.passTokens ?? user.passTokens ?? 0) || 0;

      const updatedUserProfile = {
        ...(user.userProfile || {}),
        crowns: Math.max(0, currentCrowns + crowns),
        experience: Math.max(0, currentExperience + xp),
        trophies: Math.max(0, currentTrophies + trophies)
      };

      const updatedBattlePass = {
        ...(user.battlePass || {}),
        passTokens: Math.max(0, currentPassTokens + passTokens)
      };

      const updatedUser = await UserModel.update(user.stumbleId, {
        crowns: Math.max(0, (user.crowns || 0) + crowns),
        experience: Math.max(0, (user.experience || 0) + xp),
        skillRating: Math.max(0, currentSkill + trophies + hiddenRatingDelta),
        passTokens: Math.max(0, (user.passTokens || 0) + passTokens),
        battlePass: updatedBattlePass,
        userProfile: updatedUserProfile
      });

      return res.status(200).json({
        EventId: eventId,
        Region: region,
        Rewards: {
          XP: xp,
          PASSTOKENS: passTokens,
          TROPHIES: trophies,
          CROWNS: crowns
        },
        UpdatedUser: updatedUser,
        SignedPayload: finishReq.SignedPayload || ""
      });
    } catch (err) {
      Console.error("GameEvents", "FinishV3 error:", err);
      return res.status(500).json({ message: "erro interno" });
    }
  }
}

class BattlePassController {
  static async getBattlePass(req, res) {
    try {
      const now = new Date();
      const activePass = SharedData.BattlePassRotation.find(pass => {
        const startDate = new Date(pass.StartDate);
        const endDate = new Date(pass.EndDate);
        return startDate <= now && now <= endDate;
      });

      if (!activePass) {
        Console.log("BattlePass", `No active battle pass found`);
        return res.status(404).json({ message: 'No active battle pass found' });
      }

      const battlePass = SharedData.BattlePasses.find(bp => bp.PassID === activePass.PassID);
      if (!battlePass) {
        Console.log("BattlePass", `Battle pass data not found for PassID: ${activePass.PassID}`);
        return res.status(404).json({ message: 'Battle pass data not found' });
      }

      res.json([battlePass]);
    } catch (err) {
      Console.error('BattlePass', 'Get error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async claimReward(req, res) {
    try {
      const { user } = req;
      const { Page, Section, Slot, IsPremium } = req.body;
      
      if (Page === undefined || Section === undefined || Slot === undefined) {
        Console.log("BattlePass", `Invalid claim request: ${JSON.stringify(req.body)}`);
        return res.status(400).json({ message: 'Page, Section and Slot are required' });
      }

      const slotKey = `${Page},${Section},${Slot}`;
      if (user.battlePass.slotsClaimed.includes(slotKey)) {
        Console.log("BattlePass", `Slot already claimed: ${slotKey}`);
        return res.status(400).json({ message: 'Slot already claimed' });
      }

      await database.collections.Users.updateOne(
        { deviceId: user.deviceId },
        { $push: { 'battlePass.slotsClaimed': slotKey } }  
      );

      const updatedUser = await UserModel.findByDeviceId(user.deviceId);
      res.json({ User: updatedUser });
    } catch (err) {
      Console.error('BattlePass', 'Claim error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async purchaseBattlePass(req, res) {
    try {
      const { user } = req;

      if (user.battlePass.hasPurchased) {
        Console.log("BattlePass", `User already purchased battle pass: ${user.deviceId}`);
        return res.status(400).json({ message: 'Battle pass already purchased' });
      }

      const gemsBalance = UserModel.getBalanceAmount(user, 'gems');
      if (gemsBalance < 1200) {
        Console.log("BattlePass", `Not enough gems to purchase battle pass: ${user.deviceId}`);
        return res.status(400).json({ message: 'Not enough gems' });
      }

      await UserModel.removeBalance(user.deviceId, 'gems', 1200);
      await UserModel.update(user.deviceId, { 'battlePass.hasPurchased': true });

      const updatedUser = await UserModel.findByDeviceId(user.deviceId);
      res.json({ User: updatedUser });
    } catch (err) {
      Console.error('BattlePass', 'Purchase error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async completeBattlePass(req, res) {
    try {
      const { user } = req;
      const battlePass = SharedData.BattlePasses[0];

      if (!battlePass) {
        Console.log("BattlePass", `No battle pass data available`);
        return res.status(404).json({ message: 'No battle pass data available' });
      }

      const claimedSlots = user.battlePass.slotsClaimed || [];
      const userCoins = user.battlePass.coins || 0;
      const userExperience = user.battlePass.experience || 0;
      const xpToLevelUp = battlePass.XPToLevelUp || 1000;

      const calculateLevel = (experience) => {
        return Math.floor(experience / xpToLevelUp);
      };

      const playerLevel = calculateLevel(userExperience);

      for (const [pageIndex, page] of battlePass.Content.Pages.entries()) {
        for (const [sectionIndex, section] of page.Sections.entries()) {
          const sectionUnlockLevel = section.UnlockLevel || 0;
          if (playerLevel >= sectionUnlockLevel) {
            for (const [slotIndex, slot] of section.Slots.entries()) {
              const slotKey = `${pageIndex},${sectionIndex},${slotIndex}`;
              if (!claimedSlots.includes(slotKey)) {
                if (userCoins >= slot.UnlockCost && (!slot.IsPremium || user.battlePass.hasPurchased)) {
                  await database.collections.Users.updateOne(
                    { deviceId: user.deviceId },
                    { $push: { 'battlePass.slotsClaimed': slotKey } }
                  );
                }
              }
            }
          }
        }
      }

      const updatedUser = await UserModel.findByDeviceId(user.deviceId);
      res.json({ User: updatedUser });
    } catch (err) {
      Console.error('BattlePass', 'Complete error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

class EconomyController {
  static async purchase(req, res) {
    try {
      const { user } = req;
      const itemId = req.params.item;

      Console.log('Economy', `purchase start: user=${user.stumbleId} item=${itemId}`);

      const item = SharedData.PurchasableItems.find(i => i.Name === itemId);
      if (!item) {
        Console.error('Economy', `purchase item not found: ${itemId}`);
        return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      }

      const price = (item.prices && item.prices[0]) || (item.Prices && item.Prices[0]) || null;
      if (!price) {
        Console.error('Economy', `purchase invalid price for item=${itemId}`);
        return res.status(400).json({ error: 'INVALID_PRICE' });
      }

      const currency = price.currency || price.Currency;
      const amount = price.amount || price.Amount || 0;

      if (currency && currency !== 'iap') {
        const balance = UserModel.getBalanceAmount(user, currency);
        Console.log('Economy', `purchase price: currency=${currency} amount=${amount} balance=${balance}`);
        if (balance < amount) return res.status(402).json({ error: 'INSUFFICIENT_FUNDS' });
        await UserModel.removeBalance(user.deviceId, currency, amount);
      } else {
        Console.log('Economy', `purchase via IAP or free: currency=${currency} amount=${amount}`);
      }

      const rewards = [];
      const itemRewards = item.rewards || item.Rewards || [];
      for (const reward of itemRewards) {
        const type = (reward.type || reward.Type || '').toUpperCase();
        const typeInfo = reward.typeInfo || reward.CosmeticId || reward.CurrencyType || reward.CosmeticType || '';
        const rewardAmount = reward.amount || reward.Amount || reward.min || 1;

        if (type === 'CURRENCY') {
          await UserModel.addBalance(user.deviceId, typeInfo, rewardAmount);
          rewards.push({ type: 'CURRENCY', typeInfo, amount: rewardAmount });
        } else if (type === 'SKIN') {
          await UserModel.addSkin(user.stumbleId, typeInfo);
          rewards.push({ type: 'SKIN', typeInfo });
        } else if (type === 'ACTION_EMOTE') {
          await database.addToUserArray({ stumbleId: user.stumbleId }, 'actionEmotes', typeInfo);
          rewards.push({ type: 'ACTION_EMOTE', typeInfo });
        } else if (type === 'EMOTE') {
          await database.addToUserArray({ stumbleId: user.stumbleId }, 'emotes', typeInfo);
          rewards.push({ type: 'EMOTE', typeInfo });
        } else if (type === 'COSMETIC') {
          await UserModel.addSkin(user.stumbleId, typeInfo);
          rewards.push({ type: 'COSMETIC', typeInfo });
        }
      }
    
      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);

      
      const featureFlagsWorking = [
        'age-request',
        'Consensus',
        'CustomParty',
        'EndOfMatchRewardedVideo',
        'GamePlayInGameNotifications',
        'HelpshiftConversation',
        'LocalNotifications',
        'MatchmakingFilter',
        'NewMatchmaking',
        'Pusher',
        'TournamentsX',
        'TournamentsXMeta',
        'QuantumSystemManagement',
        'RemoteLocalizations',
        'RoomManagementConsole',
        'TransferAppleIdAuthorization',
        'IPL_056_Dancefloor'
      ];

      const response = {
        FeatureFlags: featureFlagsWorking,
        PhotonJwt: "",
        TermsOfServiceAccepted: true,
        Timestamp: new Date().toISOString(),
        User: updatedUser
      }
     
      Console.log('Economy', `purchase done: user=${user.stumbleId} rewards=${JSON.stringify(rewards)}`);
      res.json({ User: updatedUser });
    } catch (err) {
      Console.error('Economy', 'Purchase error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }

  static async purchaseGasha(req, res) {
    try {
      const { user } = req;
      const { itemId } = req.params;
      const countParam = parseInt(req.params.count);
      const drawCount = isNaN(countParam) ? 1 : Math.max(1, countParam);
      Console.log('Economy', `purchaseGasha start: user=${user.stumbleId} itemId=${itemId} count=${drawCount}`);
      const hadSkins = new Set((user.skins || []));
      const rewards = [];
      const allSkins = SharedData.Skins_v4 || [];

      const gems = UserModel.getBalanceAmount(user, 'gems');
      const totalCost = 50 * drawCount;
      if (gems < totalCost) return res.status(402).json({ error: 'NOT_ENOUGH_GEMS' });

      await UserModel.removeBalance(user.deviceId, 'gems', totalCost);

      const gachaDef = (SharedData.Gachas || []).find(g => g.PurchasableItem === itemId || g.Id === itemId);
      const rotationList = gachaDef?.RotationItemList || [];
      if (rotationList.length === 0) {
        Console.warn('Economy', `purchaseGasha missing rotation list for itemId=${itemId}, falling back to Skins_v4`);
        if (allSkins.length === 0) return res.status(500).json({ error: 'NO_SKINS_AVAILABLE' });
        // Fallback: use any skin ids
        for (let i = 0; i < drawCount; i++) {
          const randomIndex = Math.floor(Math.random() * allSkins.length);
          const selectedSkin = allSkins[randomIndex];
          const skinId = selectedSkin.SkinID;
          let duplicateCurrency = null;
          let duplicateCurrencyAmount = 0;
          if (hadSkins.has(skinId)) {
            duplicateCurrency = 'dust';
            duplicateCurrencyAmount = 5;
          } else {
            await UserModel.addSkin(user.stumbleId, skinId);
            hadSkins.add(skinId);
          }
          await database.collections.Users.updateOne(
            { stumbleId: user.stumbleId },
            { $push: { Rewards: {
              Amount: 1,
              DuplicateCurrency: duplicateCurrency,
              DuplicateCurrencyAmount: duplicateCurrencyAmount,
              NestedRewards: [],
              Type: 'SKIN',
              TypeInfo: skinId
            } } }
          );
          rewards.push({ type: 'Cosmetic', cosmeticId: skinId });
        }
      } else {
        for (let i = 0; i < drawCount; i++) {
          const randomIndex = Math.floor(Math.random() * rotationList.length);
          const skinId = rotationList[randomIndex];
          let duplicateCurrency = null;
          let duplicateCurrencyAmount = 0;
          if (hadSkins.has(skinId)) {
            duplicateCurrency = 'dust';
            duplicateCurrencyAmount = 5;
          } else {
            await UserModel.addSkin(user.stumbleId, skinId);
            hadSkins.add(skinId);
          }
          await database.collections.Users.updateOne(
            { stumbleId: user.stumbleId },
            { $push: { Rewards: {
              Amount: 1,
              DuplicateCurrency: duplicateCurrency,
              DuplicateCurrencyAmount: duplicateCurrencyAmount,
              NestedRewards: [],
              Type: 'SKIN',
              TypeInfo: skinId
            } } }
          );
          rewards.push({ type: 'Cosmetic', cosmeticId: skinId });
        }
      }

      for (let i = 0; i < drawCount; i++) {
        const randomIndex = Math.floor(Math.random() * allSkins.length);
        const selectedSkin = allSkins[randomIndex];
        const skinId = selectedSkin.SkinID;
        let duplicateCurrency = null;
        let duplicateCurrencyAmount = 0;
        if (hadSkins.has(skinId)) {
          duplicateCurrency = 'dust';
          duplicateCurrencyAmount = 5;
        } else {
          await UserModel.addSkin(user.stumbleId, skinId);
          hadSkins.add(skinId);
        }
        await database.collections.Users.updateOne(
          { stumbleId: user.stumbleId },
          { $push: { Rewards: {
            Amount: 1,
            DuplicateCurrency: duplicateCurrency,
            DuplicateCurrencyAmount: duplicateCurrencyAmount,
            NestedRewards: [],
            Type: 'SKIN',
            TypeInfo: skinId
          } } }
        );
        rewards.push({ type: 'Cosmetic', cosmeticId: skinId });
      }

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      const battlePassEnd = updatedUser.battlePass?.secondsToEnd
        ? new Date(Date.now() + (updatedUser.battlePass.secondsToEnd * 1000))
        : new Date();

      const mapBalances = (balances = []) => balances.map(b => ({
        Amount: b.amount || 0,
        LastGiven: (b.lastGiven instanceof Date ? b.lastGiven.toISOString() : new Date(b.lastGiven || Date.now()).toISOString()),
        MaxAmount: b.maxAmount || 0,
        Name: b.name,
        SecondsPerUnit: b.secondsPerUnit || 0,
        SecondsSince: b.secondsSince || 0
      }));

      const settings = {
        FriendIsOnlinePush: true,
        InvitedToPartyPush: true,
        PartyInviteInGameToastNotification: true,
        PartyInviteToastNotification: true
      };

      const userPayload = {
        Age: updatedUser.age || 0,
        Animations: updatedUser.animations || [],
        AvailableNewsVersion: updatedUser.availableNewsVersion || 0,
        Balances: mapBalances(updatedUser.balances || []),
        BanReason: '',
        BattlePass: {
          FreePassRewards: updatedUser.battlePass?.freePassRewards || [],
          HasPurchased: !!updatedUser.battlePass?.hasPurchased,
          PassID: updatedUser.battlePass?.passID || 0,
          PassTokens: updatedUser.battlePass?.passTokens || 0,
          PremiumPassRewards: updatedUser.battlePass?.premiumPassRewards || [],
          SecondsToEnd: updatedUser.battlePass?.secondsToEnd || 0,
          endTime: battlePassEnd.toISOString()
        },
        Country: updatedUser.country || 'BR',
        Created: updatedUser.creationDate ? updatedUser.creationDate.toISOString() : new Date().toISOString(),
        Crowns: updatedUser.crowns || 0,
        DeviceId: updatedUser.deviceId,
        Emotes: updatedUser.emotes || [],
        Experience: updatedUser.experience || 0,
        Footsteps: updatedUser.footsteps || [],
        FreePassRewards: updatedUser.freePassRewards || [],
        HasBattlePass: !!updatedUser.hasBattlePass,
        HiddenRating: updatedUser.hiddenRating || 0,
        Id: updatedUser.id || 0,
        Inventory: (updatedUser.inventory || []).map(i => ({ Amount: i.amount || 0, Item: i.item, ItemType: i.itemType })),
        IsBanned: !!updatedUser.isBanned,
        KidFriendlyMode: updatedUser.kidFriendlyMode || 0,
        LastLogin: updatedUser.lastLogin ? updatedUser.lastLogin.toISOString() : new Date().toISOString(),
        LastLuckySpin: updatedUser.lastLuckySpin ? updatedUser.lastLuckySpin.toISOString() : new Date(Date.now() - 86400000).toISOString(),
        LatestNewsIdBackend: updatedUser.latestNewsIdBackend || 0,
        MyOwnCode: updatedUser.MyOwnCode || '',
        NewsVersion: updatedUser.newsVersion || 0,
        PassTokens: updatedUser.passTokens || 0,
        PremiumPassRewards: updatedUser.premiumPassRewards || [],
        Region: updatedUser.region || 'SA',
        RewardID: 'deprecated',
        Rewards: updatedUser.Rewards || [],
        SecondsSinceCreated: updatedUser.secondsSinceCreated || 0,
        SelectedSkin: updatedUser.equippedCosmetics?.skin || 'SKIN1',
        Settings: settings,
        SkillRating: updatedUser.skillRating || 0,
        Skins: updatedUser.skins || [],
        StumbleId: updatedUser.stumbleId,
        Token: updatedUser.token,
        Username: updatedUser.username,
        Version: updatedUser.version || '0'
      };

      const featureFlagsWorking = [
        'age-request',
        'Consensus',
        'CustomParty',
        'EndOfMatchRewardedVideo',
        'GamePlayInGameNotifications',
        'HelpshiftConversation',
        'LocalNotifications',
        'MatchmakingFilter',
        'NewMatchmaking',
        'Pusher',
        'TournamentsX',
        'TournamentsXMeta',
        'QuantumSystemManagement',
        'RemoteLocalizations',
        'RoomManagementConsole',
        'TransferAppleIdAuthorization',
        'IPL_056_Dancefloor'
      ];

      const response = {
        FeatureFlags: featureFlagsWorking,
        PhotonJwt: "",
        TermsOfServiceAccepted: true,
        Timestamp: new Date().toISOString(),
        User: userPayload
      };

      Console.log('Economy', `purchaseGasha done: user=${user.stumbleId} rewardsCount=${rewards.length}`);
      return res.status(200).json({ User: userPayload });
    } catch (err) {
      Console.error('Economy', 'Gasha error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }

  static async purchaseLuckySpin(req, res) {
    try {
      const { user } = req;
      Console.log('Economy', `purchaseLuckySpin start: user=${user.stumbleId}`);

      const gems = UserModel.getBalanceAmount(user, 'gems');
      if (gems < 50) return res.status(402).json({ error: 'NOT_ENOUGH_GEMS' });

      await UserModel.removeBalance(user.deviceId, 'gems', 50);

      const allSkins = SharedData.Skins_v4 || [];
      if (allSkins.length === 0) return res.status(500).json({ error: 'NO_SKINS_AVAILABLE' });

      const randomIndex = Math.floor(Math.random() * allSkins.length);
      const selectedSkin = allSkins[randomIndex];

      const skinId = selectedSkin.SkinID;
      let duplicateCurrency = null;
      let duplicateCurrencyAmount = 0;
      const hadSkins = new Set((user.skins || []).map(s => s));
      if (hadSkins.has(skinId)) {
        duplicateCurrency = 'dust';
        duplicateCurrencyAmount = 5;
      } else {
        await UserModel.addSkin(user.stumbleId, skinId);
      }

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $push: { Rewards: {
          Amount: 1,
          DuplicateCurrency: duplicateCurrency,
          DuplicateCurrencyAmount: duplicateCurrencyAmount,
          NestedRewards: [],
          Type: 'SKIN',
          TypeInfo: skinId
        } } }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);

      const battlePassEnd = updatedUser.battlePass?.secondsToEnd
        ? new Date(Date.now() + (updatedUser.battlePass.secondsToEnd * 1000))
        : new Date();

      const mapBalances = (balances = []) => balances.map(b => ({
        Amount: b.amount || 0,
        LastGiven: (b.lastGiven instanceof Date ? b.lastGiven.toISOString() : new Date(b.lastGiven || Date.now()).toISOString()),
        MaxAmount: b.maxAmount || 0,
        Name: b.name,
        SecondsPerUnit: b.secondsPerUnit || 0,
        SecondsSince: b.secondsSince || 0
      }));

      const settings = {
        FriendIsOnlinePush: true,
        InvitedToPartyPush: true,
        PartyInviteInGameToastNotification: true,
        PartyInviteToastNotification: true
      };

      const userPayload = {
        Age: updatedUser.age || 0,
        Animations: updatedUser.animations || [],
        AvailableNewsVersion: updatedUser.availableNewsVersion || 0,
        Balances: mapBalances(updatedUser.balances || []),
        BanReason: '',
        BattlePass: {
          FreePassRewards: updatedUser.battlePass?.freePassRewards || [],
          HasPurchased: !!updatedUser.battlePass?.hasPurchased,
          PassID: updatedUser.battlePass?.passID || 0,
          PassTokens: updatedUser.battlePass?.passTokens || 0,
          PremiumPassRewards: updatedUser.battlePass?.premiumPassRewards || [],
          SecondsToEnd: updatedUser.battlePass?.secondsToEnd || 0,
          endTime: battlePassEnd.toISOString()
        },
        Country: updatedUser.country || 'BR',
        Created: updatedUser.creationDate ? updatedUser.creationDate.toISOString() : new Date().toISOString(),
        Crowns: updatedUser.crowns || 0,
        DeviceId: updatedUser.deviceId,
        Emotes: updatedUser.emotes || [],
        Experience: updatedUser.experience || 0,
        Footsteps: updatedUser.footsteps || [],
        FreePassRewards: updatedUser.freePassRewards || [],
        HasBattlePass: !!updatedUser.hasBattlePass,
        HiddenRating: updatedUser.hiddenRating || 0,
        Id: updatedUser.id || 0,
        Inventory: (updatedUser.inventory || []).map(i => ({ Amount: i.amount || 0, Item: i.item, ItemType: i.itemType })),
        IsBanned: !!updatedUser.isBanned,
        KidFriendlyMode: updatedUser.kidFriendlyMode || 0,
        LastLogin: updatedUser.lastLogin ? updatedUser.lastLogin.toISOString() : new Date().toISOString(),
        LastLuckySpin: updatedUser.lastLuckySpin ? updatedUser.lastLuckySpin.toISOString() : new Date().toISOString(),
        LatestNewsIdBackend: updatedUser.latestNewsIdBackend || 0,
        MyOwnCode: updatedUser.MyOwnCode || '',
        NewsVersion: updatedUser.newsVersion || 0,
        PassTokens: updatedUser.passTokens || 0,
        PremiumPassRewards: updatedUser.premiumPassRewards || [],
        Region: updatedUser.region || 'SA',
        RewardID: 'deprecated',
        Rewards: updatedUser.Rewards || [],
        SecondsSinceCreated: updatedUser.secondsSinceCreated || 0,
        SelectedSkin: updatedUser.equippedCosmetics?.skin || 'SKIN1',
        Settings: settings,
        SkillRating: updatedUser.skillRating || 0,
        Skins: updatedUser.skins || [],
        StumbleId: updatedUser.stumbleId,
        Token: updatedUser.token,
        Username: updatedUser.username,
        Version: updatedUser.version || '0'
      };

      const response = {
        FeatureFlags: [
        'age-request',
        'Consensus',
        'CustomParty',
        'EndOfMatchRewardedVideo',
        'GamePlayInGameNotifications',
        'HelpshiftConversation',
        'LocalNotifications',
        'MatchmakingFilter',
        'NewMatchmaking',
        'Pusher',
        'TournamentsX',
        'TournamentsXMeta',
        'QuantumSystemManagement',
        'RemoteLocalizations',
        'RoomManagementConsole',
        'TransferAppleIdAuthorization',
        'IPL_056_Dancefloor'
      ],
        PhotonJwt: "",
        TermsOfServiceAccepted: true,
        Timestamp: new Date().toISOString(),
        User: userPayload
      };

      Console.log('Economy', `purchaseLuckySpin done: user=${user.stumbleId} skin=${skinId}`);
      return res.status(200).json({ User: userPayload });
    } catch (err) {
      Console.error('Economy', 'LuckySpin error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }

  // Roleta por raridade: common, rare
  static async purchaseWheelDrop(req, res) {
    try {
      const { user } = req;
      const rawRarity = String(req.params.itemId || req.params.rarity || '').toUpperCase();
      const count = Math.max(1, parseInt(req.params.count || '1', 10) || 1);

      // Preços baseados no que o usuário enviou anteriormente
      const WHEEL_PRICES = { COMMON: 55, UNCOMMON: 55, RARE: 90, EPIC: 135 };
      const pricePerSpin = WHEEL_PRICES[rawRarity] !== undefined ? WHEEL_PRICES[rawRarity] : 90;
      const totalCost = pricePerSpin * count;

      const gems = UserModel.getBalanceAmount(user, 'gems');
      if (gems < totalCost) return res.status(402).json({ error: 'NOT_ENOUGH_GEMS' });
      await UserModel.removeBalance(user.deviceId, 'gems', totalCost);

      const allSkins = Array.isArray(SharedData.Skins_v4) ? SharedData.Skins_v4 : [];
      const ownedSkins = new Set((user.skins || []).map(s => s));
      const currentRewards = [];
      const allPicks = [];

      // Lógica de pesos solicitada:
      // Comum: Comum (50%), Incomum (30%), Rara (15%), Épica (5%)
      // Rara: Rara (70%), Épica (25%), Lendária (5%)
      let weights = [];
      let visualRarity = 'COMMON'; // Forçamos 'COMMON' pois o usuário disse que ela funciona perfeitamente

      if (rawRarity === 'COMMON' || rawRarity === 'UNCOMMON') {
        weights = [
          { rarity: 'COMMON', weight: 50 },
          { rarity: 'UNCOMMON', weight: 30 },
          { rarity: 'RARE', weight: 15 },
          { rarity: 'EPIC', weight: 5 }
        ];
      } else if (rawRarity === 'RARE') {
        weights = [
          { rarity: 'RARE', weight: 70 },
          { rarity: 'EPIC', weight: 25 },
          { rarity: 'LEGENDARY', weight: 5 }
        ];
      } else if (rawRarity === 'EPIC') {
        weights = [
          { rarity: 'EPIC', weight: 90 },
          { rarity: 'SPECIAL', weight: 10 }
        ];
      } else {
        weights = [{ rarity: rawRarity, weight: 100 }];
      }

      const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);

      for (let i = 0; i < count; i++) {
        let random = Math.random() * totalWeight;
        let selectedRarity = weights[0].rarity;
        for (const item of weights) {
          if (random < item.weight) {
            selectedRarity = item.rarity;
            break;
          }
          random -= item.weight;
        }

        const skinsInRarity = allSkins.filter(s => String(s.Rarity).toUpperCase() === selectedRarity);
        const skinId = skinsInRarity.length > 0 
          ? skinsInRarity[Math.floor(Math.random() * skinsInRarity.length)].SkinID 
          : allSkins[Math.floor(Math.random() * allSkins.length)].SkinID;

        let duplicateCurrency = null;
        let duplicateCurrencyAmount = 0;
        if (ownedSkins.has(skinId)) {
          duplicateCurrency = 'dust';
          // Lendária dá 50, Épica dá 30, demais dão 15 (conforme pedido na roleta perfeita)
          duplicateCurrencyAmount = selectedRarity === 'LEGENDARY' ? 50 : (selectedRarity === 'EPIC' ? 30 : 15);
          await UserModel.addBalance(user.deviceId, 'dust', duplicateCurrencyAmount);
        } else {
          await UserModel.addSkin(user.stumbleId, skinId);
          ownedSkins.add(skinId);
        }

        // Para forçar o giro visual de 1x, usamos o wrapper LOOTBOX apenas na resposta
        // mas salvamos a SKIN no banco para não dropar a caixa no inventário.
        const skinReward = {
          Amount: 1,
          DuplicateCurrency: duplicateCurrency,
          DuplicateCurrencyAmount: duplicateCurrencyAmount,
          NestedRewards: [],
          Type: 'SKIN',
          TypeInfo: skinId
        };

        const visualReward = count === 1 ? {
          Amount: 1,
          DuplicateCurrency: null,
          DuplicateCurrencyAmount: 0,
          NestedRewards: [skinReward],
          Type: 'LOOTBOX',
          TypeInfo: visualRarity // COMMON, RARE, EPIC
        } : skinReward;

        await database.collections.Users.updateOne(
          { stumbleId: user.stumbleId },
          { $push: { Rewards: skinReward } }
        );
        currentRewards.push(visualReward);
      }

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      const battlePassEnd = updatedUser.battlePass?.secondsToEnd
        ? new Date(Date.now() + (updatedUser.battlePass.secondsToEnd * 1000))
        : new Date();

      const mapBalances = (balances = []) => balances.map(b => ({
        Amount: b.amount || 0,
        LastGiven: (b.lastGiven instanceof Date ? b.lastGiven.toISOString() : new Date(b.lastGiven || Date.now()).toISOString()),
        MaxAmount: b.maxAmount || 0,
        Name: b.name,
        SecondsPerUnit: b.secondsPerUnit || 0,
        SecondsSince: b.secondsSince || 0
      }));

      const userPayload = {
        Age: updatedUser.age || 0,
        Animations: updatedUser.animations || [],
        AvailableNewsVersion: updatedUser.availableNewsVersion || 0,
        Balances: mapBalances(updatedUser.balances || []),
        BanReason: '',
        BattlePass: {
          FreePassRewards: updatedUser.battlePass?.freePassRewards || [],
          HasPurchased: !!updatedUser.battlePass?.hasPurchased,
          PassID: updatedUser.battlePass?.passID || 0,
          PassTokens: updatedUser.battlePass?.passTokens || 0,
          PremiumPassRewards: updatedUser.battlePass?.premiumPassRewards || [],
          SecondsToEnd: updatedUser.battlePass?.secondsToEnd || 0,
          endTime: battlePassEnd.toISOString()
        },
        Country: updatedUser.country || 'BR',
        Created: updatedUser.creationDate ? updatedUser.creationDate.toISOString() : new Date().toISOString(),
        Crowns: updatedUser.crowns || 0,
        DeviceId: updatedUser.deviceId,
        Emotes: updatedUser.emotes || [],
        Experience: updatedUser.experience || 0,
        Footsteps: updatedUser.footsteps || [],
        FreePassRewards: updatedUser.freePassRewards || [],
        HasBattlePass: !!updatedUser.hasBattlePass,
        HiddenRating: updatedUser.hiddenRating || 0,
        Id: updatedUser.id || 0,
        Inventory: (updatedUser.inventory || []).map(i => ({ Amount: i.amount || 0, Item: i.item, ItemType: i.itemType })),
        IsBanned: !!updatedUser.isBanned,
        KidFriendlyMode: updatedUser.kidFriendlyMode || 0,
        LastLogin: updatedUser.lastLogin ? updatedUser.lastLogin.toISOString() : new Date().toISOString(),
        LastLuckySpin: updatedUser.lastLuckySpin ? updatedUser.lastLuckySpin.toISOString() : new Date().toISOString(),
        LatestNewsIdBackend: updatedUser.latestNewsIdBackend || 0,
        MyOwnCode: updatedUser.MyOwnCode || '',
        NewsVersion: updatedUser.newsVersion || 0,
        PassTokens: updatedUser.passTokens || 0,
        PremiumPassRewards: updatedUser.premiumPassRewards || [],
        Region: updatedUser.region || 'EU',
        RewardID: 'deprecated',
        Rewards: currentRewards,
        SecondsSinceCreated: updatedUser.secondsSinceCreated || 0,
        SelectedSkin: updatedUser.equippedCosmetics?.skin || 'SKIN1',
        Settings: { FriendIsOnlinePush: true, InvitedToPartyPush: true, PartyInviteInGameToastNotification: true, PartyInviteToastNotification: true },
        SkillRating: updatedUser.skillRating || 0,
        Skins: updatedUser.skins || [],
        StumbleId: updatedUser.stumbleId,
        Token: updatedUser.token,
        Username: updatedUser.username,
        Version: updatedUser.version || '0'
      };

      Console.log('Economy', `purchaseWheelDrop done: user=${user.stumbleId} count=${count}`);
      return res.status(200).json({ User: userPayload });
    } catch (err) {
      Console.error('Economy', 'WheelDrop error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }

  static async purchaseLuckySpinWheel(req, res) {
    try {
      const { user } = req;
      Console.log('Economy', `purchaseLuckySpinWheel start: user=${user.stumbleId}`);

      const now = new Date();
      const gemOptions = [10, 15, 20, 25, 30, 35, 40, 50, 75, 100, 150];
      const amount = gemOptions[Math.floor(Math.random() * gemOptions.length)];
      
      await UserModel.addBalance(user.deviceId, 'gems', amount);
      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $set: { lastLuckySpin: now } }
      );

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId, "balances.name": "gems" },
        { $set: { "balances.$.lastGiven": now } }
      );

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $push: { Rewards: {
          Amount: amount,
          DuplicateCurrency: null,
          DuplicateCurrencyAmount: 0,
          NestedRewards: [],
          Type: 'CURRENCY',
          TypeInfo: 'gems'
        } } }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);

      const mapBalances = (balances = []) => balances.map(b => ({
        Amount: b.amount || 0,
        LastGiven: (b.lastGiven instanceof Date ? b.lastGiven.toISOString() : new Date(b.lastGiven || Date.now()).toISOString()),
        MaxAmount: b.maxAmount || 0,
        Name: b.name,
        SecondsPerUnit: b.secondsPerUnit || 0,
        SecondsSince: b.secondsSince || 0
      }));

      const settings = {
        FriendIsOnlinePush: true,
        InvitedToPartyPush: true,
        PartyInviteInGameToastNotification: true,
        PartyInviteToastNotification: true
      };

      const battlePassEnd = updatedUser.battlePass?.secondsToEnd
        ? new Date(Date.now() + (updatedUser.battlePass.secondsToEnd * 1000))
        : new Date();

      const userPayload = {
        Age: updatedUser.age || 0,
        Animations: updatedUser.animations || [],
        AvailableNewsVersion: updatedUser.availableNewsVersion || 0,
        Balances: mapBalances(updatedUser.balances || []),
        BanReason: '',
        BattlePass: {
          FreePassRewards: updatedUser.battlePass?.freePassRewards || [],
          HasPurchased: !!updatedUser.battlePass?.hasPurchased,
          PassID: updatedUser.battlePass?.passID || 0,
          PassTokens: updatedUser.battlePass?.passTokens || 0,
          PremiumPassRewards: updatedUser.battlePass?.premiumPassRewards || [],
          SecondsToEnd: updatedUser.battlePass?.secondsToEnd || 0,
          endTime: battlePassEnd.toISOString()
        },
        Country: updatedUser.country || 'PL',
        Created: updatedUser.creationDate ? updatedUser.creationDate.toISOString() : new Date().toISOString(),
        Crowns: updatedUser.crowns || 0,
        DeviceId: updatedUser.deviceId,
        Emotes: updatedUser.emotes || [],
        Experience: updatedUser.experience || 0,
        Footsteps: updatedUser.footsteps || [],
        FreePassRewards: updatedUser.freePassRewards || [],
        HasBattlePass: !!updatedUser.hasBattlePass,
        HiddenRating: updatedUser.hiddenRating || 0,
        Id: updatedUser.id || 0,
        Inventory: (updatedUser.inventory || []).map(i => ({ Amount: i.amount || 0, Item: i.item, ItemType: i.itemType })),
        IsBanned: !!updatedUser.isBanned,
        KidFriendlyMode: updatedUser.kidFriendlyMode || 0,
        LastLogin: updatedUser.lastLogin ? updatedUser.lastLogin.toISOString() : new Date().toISOString(),
        LastLuckySpin: updatedUser.lastLuckySpin ? updatedUser.lastLuckySpin.toISOString() : now.toISOString(),
        LatestNewsIdBackend: updatedUser.latestNewsIdBackend || 0,
        MyOwnCode: updatedUser.MyOwnCode || '',
        NewsVersion: updatedUser.newsVersion || 0,
        PassTokens: updatedUser.passTokens || 0,
        PremiumPassRewards: updatedUser.premiumPassRewards || [],
        Region: updatedUser.region || 'EU',
        RewardID: 'deprecated',
        Rewards: [{
          amount: amount,
          duplicateCurrencyAmount: 0,
          nestedRewards: [],
          sourceType: 'UNKNOWN',
          type: 'CURRENCY',
          typeInfo: 'gems'
        }],
        SecondsSinceCreated: updatedUser.secondsSinceCreated || 0,
        SelectedSkin: updatedUser.equippedCosmetics?.skin || 'SKIN1',
        Settings: settings,
        SkillRating: updatedUser.skillRating || 0,
        Skins: updatedUser.skins || [],
        StumbleId: updatedUser.stumbleId,
        Token: updatedUser.token,
        Username: updatedUser.username,
        Version: updatedUser.version || '0'
      };

      
      Console.log('Economy', `purchaseLuckySpinWheel done: user=${user.stumbleId}`);
      return res.status(200).json({ User: userPayload });
    } catch (err) {
      Console.error('Economy', 'LuckySpinWheel error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }

  static async purchaseDrop(req, res) {
    try {
      const { user } = req;
      const { itemId, count } = req.params;
      Console.log('Economy', `purchaseDrop start: user=${user.stumbleId} rarity=${itemId} count=${count}`);

      const photonJwt = "";

      const rarity = String(itemId || '').toUpperCase();
      const totalCount = Math.max(1, parseInt(count || '1', 10) || 1);

      const allSkins = Array.isArray(SharedData.Skins_v4) ? SharedData.Skins_v4 : [];
      const byRarity = allSkins.filter(s => String(s.Rarity).toUpperCase() === rarity);

      function findMobileLuckySpinOffer(shared) {
        if (Array.isArray(shared.LuckySpinWheels)) {
          for (const wheel of shared.LuckySpinWheels) {
            const platforms = Array.isArray(wheel.Platforms) ? wheel.Platforms : [];
            if (Array.isArray(wheel.SpinVisualDropsList) && (platforms.includes('android') || platforms.includes('ios'))) {
              return wheel;
            }
          }
        }
        for (const key of Object.keys(shared)) {
          const val = shared[key];
          if (Array.isArray(val)) {
            for (const el of val) {
              if (el && typeof el === 'object') {
                const platforms = Array.isArray(el.Platforms) ? el.Platforms : [];
                if (Array.isArray(el.SpinVisualDropsList) && (platforms.includes('android') || platforms.includes('ios'))) {
                  return el;
                }
              }
            }
          } else if (val && typeof val === 'object') {
            const platforms = Array.isArray(val.Platforms) ? val.Platforms : [];
            if (Array.isArray(val.SpinVisualDropsList) && (platforms.includes('android') || platforms.includes('ios'))) {
              return val;
            }
          }
        }
        return null;
      }

      const spinOffer = findMobileLuckySpinOffer(SharedData);
      const visualSkinIdsRaw = spinOffer
        ? (spinOffer.SpinVisualDropsList || []).filter(x => typeof x === 'string' && x.startsWith('SKIN'))
        : [];
      const skinById = new Map(allSkins.map(s => [s.SkinID, s]));
      let visualSkinIds = visualSkinIdsRaw.filter(id => (skinById.get(id)?.Rarity || '').toUpperCase() === rarity);
      if (visualSkinIds.length === 0) {
        visualSkinIds = visualSkinIdsRaw; // fallback: allow any SKIN in visual list
      }
      Console.log('Economy', `purchaseDrop spinOffer=${spinOffer?.Id || 'unknown'} rarity=${rarity} visualCount=${visualSkinIds.length}`);

      const existingSkins = new Set((user.skins || []).map(s => s));

      const picks = [];
      let pool = [];
      if (visualSkinIds.length > 0) {
        pool = visualSkinIds.filter(id => !existingSkins.has(id));
      } else {
        pool = [...byRarity.map(s => s.SkinID).filter(id => !existingSkins.has(id))];
      }

      function pickUniqueFromPool(n) {
        const chosen = [];
        const tempPool = [...pool];
        for (let i = 0; i < n && tempPool.length > 0; i++) {
          const idx = Math.floor(Math.random() * tempPool.length);
          const id = tempPool.splice(idx, 1)[0];
          chosen.push(id);
        }
        return chosen;
      }

      // Fill with unique picks first
      picks.push(...pickUniqueFromPool(totalCount));
      let remaining = totalCount - picks.length;
      // If need more, fill with random from visual list (with replacement) or byRarity
      while (remaining > 0) {
        if (visualSkinIds.length > 0) {
          const idx = Math.floor(Math.random() * visualSkinIds.length);
          picks.push(visualSkinIds[idx]);
        } else if (byRarity.length > 0) {
          const idx = Math.floor(Math.random() * byRarity.length);
          picks.push(byRarity[idx].SkinID);
        } else {
          break;
        }
        remaining--;
      }

      if (picks.length === 0) {
        if (visualSkinIds.length > 0) {
          for (let i = 0; i < totalCount; i++) {
            const idx = Math.floor(Math.random() * visualSkinIds.length);
            picks.push(visualSkinIds[idx]);
          }
        } else if (byRarity.length > 0) {
          for (let i = 0; i < totalCount; i++) {
            const idx = Math.floor(Math.random() * byRarity.length);
            picks.push(byRarity[idx].SkinID);
          }
        }
      }

      const hadSkins = new Set((user.skins || []).map(s => s));
      for (const skinId of picks) {
        let duplicateCurrency = null;
        let duplicateCurrencyAmount = 0;
        if (hadSkins.has(skinId)) {
          duplicateCurrency = 'dust';
          duplicateCurrencyAmount = 5;
        } else {
          await UserModel.addSkin(user.stumbleId, skinId);
          hadSkins.add(skinId);
        }
        const noVisual = !(spinOffer && visualSkinIds.length > 0);
        const typeInfoForSpin = noVisual ? rarity.toUpperCase() : skinId;
        const rewardDoc = noVisual ? {
          Amount: 1,
          DuplicateCurrency: null,
          DuplicateCurrencyAmount: 0,
          NestedRewards: [{
            Amount: 1,
            DuplicateCurrency: duplicateCurrency,
            DuplicateCurrencyAmount: duplicateCurrencyAmount,
            NestedRewards: [],
            Type: 'SKIN',
            TypeInfo: skinId
          }],
          Type: 'LOOTBOX',
          TypeInfo: typeInfoForSpin
        } : {
          Amount: 1,
          DuplicateCurrency: duplicateCurrency,
          DuplicateCurrencyAmount: duplicateCurrencyAmount,
          NestedRewards: [],
          Type: 'SKIN',
          TypeInfo: typeInfoForSpin
        };
        await database.collections.Users.updateOne(
          { stumbleId: user.stumbleId },
          { $push: { Rewards: rewardDoc } }
        );
        Console.log('Economy', `purchaseDrop reward pushed type=${noVisual ? 'LOOTBOX' : 'SKIN'} typeInfo=${typeInfoForSpin} nested=${noVisual ? skinId : 'none'}`);
      }

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);

      const battlePassEnd = updatedUser.battlePass?.secondsToEnd
        ? new Date(Date.now() + (updatedUser.battlePass.secondsToEnd * 1000))
        : new Date();

      const mapBalances = (balances = []) => balances.map(b => ({
        Amount: b.amount || 0,
        LastGiven: (b.lastGiven instanceof Date ? b.lastGiven.toISOString() : new Date(b.lastGiven || Date.now()).toISOString()),
        MaxAmount: b.maxAmount || 0,
        Name: b.name,
        SecondsPerUnit: b.secondsPerUnit || 0,
        SecondsSince: b.secondsSince || 0
      }));

      const settings = {
        FriendIsOnlinePush: true,
        InvitedToPartyPush: true,
        PartyInviteInGameToastNotification: true,
        PartyInviteToastNotification: true
      };

      const userPayload = {
        Age: updatedUser.age || 0,
        Animations: updatedUser.animations || [],
        AvailableNewsVersion: updatedUser.availableNewsVersion || 0,
        Balances: mapBalances(updatedUser.balances || []),
        BanReason: '',
        BattlePass: {
          FreePassRewards: updatedUser.battlePass?.freePassRewards || [],
          HasPurchased: !!updatedUser.battlePass?.hasPurchased,
          PassID: updatedUser.battlePass?.passID || 0,
          PassTokens: updatedUser.battlePass?.passTokens || 0,
          PremiumPassRewards: updatedUser.battlePass?.premiumPassRewards || [],
          SecondsToEnd: updatedUser.battlePass?.secondsToEnd || 0,
          endTime: battlePassEnd.toISOString()
        },
        Country: updatedUser.country || 'BR',
        Created: updatedUser.creationDate ? updatedUser.creationDate.toISOString() : new Date().toISOString(),
        Crowns: updatedUser.crowns || 0,
        DeviceId: updatedUser.deviceId,
        Emotes: updatedUser.emotes || [],
        Experience: updatedUser.experience || 0,
        Footsteps: updatedUser.footsteps || [],
        FreePassRewards: updatedUser.freePassRewards || [],
        HasBattlePass: !!updatedUser.hasBattlePass,
        HiddenRating: updatedUser.hiddenRating || 0,
        Id: updatedUser.id || 0,
        Inventory: (updatedUser.inventory || []).map(i => ({ Amount: i.amount || 0, Item: i.item, ItemType: i.itemType })),
        IsBanned: !!updatedUser.isBanned,
        KidFriendlyMode: updatedUser.kidFriendlyMode || 0,
        LastLogin: updatedUser.lastLogin ? updatedUser.lastLogin.toISOString() : new Date().toISOString(),
        LastLuckySpin: updatedUser.lastLuckySpin ? updatedUser.lastLuckySpin.toISOString() : new Date(Date.now() - 86400000).toISOString(),
        LatestNewsIdBackend: updatedUser.latestNewsIdBackend || 0,
        MyOwnCode: updatedUser.MyOwnCode || '',
        NewsVersion: updatedUser.newsVersion || 0,
        PassTokens: updatedUser.passTokens || 0,
        PremiumPassRewards: updatedUser.premiumPassRewards || [],
        Region: updatedUser.region || 'SA',
        RewardID: 'deprecated',
        Rewards: updatedUser.Rewards || [],
        SecondsSinceCreated: updatedUser.secondsSinceCreated || 0,
        SelectedSkin: updatedUser.equippedCosmetics?.skin || 'SKIN1',
        Settings: settings,
        SkillRating: updatedUser.skillRating || 0,
        Skins: updatedUser.skins || [],
        StumbleId: updatedUser.stumbleId,
        Token: updatedUser.token,
        Username: updatedUser.username,
        Version: updatedUser.version || '0'
      };

      const featureFlagsWorking = [
        'age-request',
        'Consensus',
        'CustomParty',
        'EndOfMatchRewardedVideo',
        'GamePlayInGameNotifications',
        'HelpshiftConversation',
        'LocalNotifications',
        'MatchmakingFilter',
        'NewMatchmaking',
        'Pusher',
        'TournamentsX',
        'TournamentsXMeta',
        'QuantumSystemManagement',
        'RemoteLocalizations',
        'RoomManagementConsole',
        'TransferAppleIdAuthorization',
        'IPL_056_Dancefloor'
      ];

      const response = {
        FeatureFlags: featureFlagsWorking,
        PhotonJwt: photonJwt,
        TermsOfServiceAccepted: true,
        Timestamp: new Date().toISOString(),
        User: userPayload
      };

      Console.log('Economy', `purchaseDrop done: user=${user.stumbleId} picks=${picks.length}`);
      const wantsCompression = String(req.headers['use_response_compression'] || '').toLowerCase() === 'true' && String(req.headers['accept-encoding'] || '').includes('gzip');
      if (wantsCompression) {
        const buf = zlib.gzipSync(Buffer.from(JSON.stringify(response)));
        res.set('Content-Encoding', 'gzip');
        res.set('Content-Type', 'application/json');
        return res.status(200).send(buf);
      }
      return res.status(200).json({ User: userPayload });
    } catch (err) {
      Console.error('Economy', 'PurchaseDrop error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }

  static async giveCurrency(req, res) {
    try {
      const { currencyType, amount } = req.params;
      const { user } = req;
      Console.log('Economy', `giveCurrency start: user=${user.stumbleId} type=${currencyType} amount=${amount}`);

      const currencyMap = {
        Gems: 'gems',
        Gold: 'coins',
        Dust: 'dust',
        FreeSpins: 'default_free_spins',
        AdSpins: 'default_free_ad_spins'
      };

      const resolvedCurrency = currencyMap[currencyType] || currencyType;
      const userBalanceNames = (user.balances || []).map(b => b.name);
      const isKnownCurrency = userBalanceNames.includes(resolvedCurrency);
      if (!isKnownCurrency) {
        return res.status(400).json({ error: 'INVALID_CURRENCY' });
      }

      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount)) {
        return res.status(400).json({ error: 'INVALID_AMOUNT' });
      }

      await UserModel.addBalance(user.deviceId, resolvedCurrency, parsedAmount);
      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);

      Console.log('Economy', `giveCurrency done: user=${user.stumbleId} type=${resolvedCurrency} amount=${parsedAmount}`);
      res.json({
        success: true,
        user: updatedUser,
        currencyAdded: { type: resolvedCurrency, amount: parsedAmount }
      });
    } catch (err) {
      Console.error('Economy', 'GiveCurrency error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }
}


class AnalyticsController {
  static async analytic(req, res) {
    try {
      const { user } = req;
      const { type, message } = req.body;

      if (!type || !message) {
        return res.status(400).json({ message: 'Type and message are required' });
      }

      await database.collections.Analytics.insertOne({
        DeviceId: user.deviceId,
        type,
        message,
        timestamp: new Date()
      });
      Console.log("Analytics", `Received analytic from user ${user.username}: [${type}] ${message}`);
      res.status(200).json("OK");
    } catch (err) {
      Console.error("Analytics", "Error:", err);
      res.status(500).json("Error");
    }
  }
}

class FriendsController {
  static async add(req, res) {
    try {
      const { UserId } = req.body;
      const { user } = req;

      if (!UserId) return res.status(400).json({ message: 'UserId is required' });

      let friend = await UserModel.findById(UserId);
      if (!friend) {
        friend = await UserModel.findByStumbleId(UserId);
      }
      if (!friend) return res.status(404).json({ message: 'User not found' });

      if (user.friends.includes(friend.stumbleId)) {
        return res.status(409).json({ message: 'Already friends' });
      }

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $addToSet: { friends: friend.stumbleId } }
      );

      await database.collections.Users.updateOne(
        { stumbleId: friend.stumbleId },
        { $addToSet: { friends: user.stumbleId } }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      const userProfile = { ...updatedUser.userProfile, isOnline: true };
      return res.status(200).json(userProfile);
    } catch (err) {
      console.error('Friends Add error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async request(req, res) {
    try {
      const { UserId } = req.body;
      const { user } = req;

      if (!UserId) return res.status(400).json({ message: 'UserId is required' });

      let toUser = await UserModel.findById(UserId);
      if (!toUser) {
        toUser = await UserModel.findByStumbleId(UserId);
      }
      if (!toUser) return res.status(404).json({ message: 'User not found' });

      if (user.sentFriendRequests.includes(toUser.stumbleId)) {
        return res.status(409).json({ message: 'Request already sent' });
      }

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $addToSet: { sentFriendRequests: toUser.stumbleId } }
      );

      await database.collections.Users.updateOne(
        { stumbleId: toUser.stumbleId },
        { $addToSet: { receivedFriendRequests: user.stumbleId } }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      const userProfile = { ...updatedUser.userProfile, isOnline: true };
      return res.status(200).json(userProfile);
    } catch (err) {
      console.error('Friends Request error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async accept(req, res) {
    try {
      const { UserId } = req.body;
      const { user } = req;

      if (!UserId) return res.status(400).json({ message: 'UserId is required' });

      let fromUser = await UserModel.findById(UserId);
      if (!fromUser) {
        fromUser = await UserModel.findByStumbleId(UserId);
      }
      if (!fromUser) return res.status(404).json({ message: 'User not found' });

      if (!user.receivedFriendRequests.includes(fromUser.stumbleId)) {
        return res.status(404).json({ message: 'No friend request found' });
      }

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        {
          $pull: { receivedFriendRequests: fromUser.stumbleId },
          $addToSet: { friends: fromUser.stumbleId }
        }
      );

      await database.collections.Users.updateOne(
        { stumbleId: fromUser.stumbleId },
        {
          $pull: { sentFriendRequests: user.stumbleId },
          $addToSet: { friends: user.stumbleId }
        }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      const userProfile = { ...updatedUser.userProfile, isOnline: true };
      return res.status(200).json(userProfile);
    } catch (err) {
      console.error('Friends Accept error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async reject(req, res) {
    try {
      const { UserId } = req.body;
      const { user } = req;

      if (!UserId) return res.status(400).json({ message: 'UserId is required' });

      let fromUser = await UserModel.findById(UserId);
      if (!fromUser) {
        fromUser = await UserModel.findByStumbleId(UserId);
      }
      if (!fromUser) return res.status(404).json({ message: 'User not found' });

      if (!user.receivedFriendRequests.includes(fromUser.stumbleId)) {
        return res.status(404).json({ message: 'No friend request found' });
      }

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $pull: { receivedFriendRequests: fromUser.stumbleId } }
      );

      await database.collections.Users.updateOne(
        { stumbleId: fromUser.stumbleId },
        { $pull: { sentFriendRequests: user.stumbleId } }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      return res.status(200).json(updatedUser.userProfile);
    } catch (err) {
      console.error('Friends Reject error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async cancel(req, res) {
    try {
      const { UserId } = req.body;
      const { user } = req;

      if (!UserId) return res.status(400).json({ message: 'UserId is required' });

      let toUser = await UserModel.findById(UserId);
      if (!toUser) {
        toUser = await UserModel.findByStumbleId(UserId);
      }
      if (!toUser) return res.status(404).json({ message: 'User not found' });

      if (!user.sentFriendRequests.includes(toUser.stumbleId)) {
        return res.status(404).json({ message: 'No friend request found' });
      }

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $pull: { sentFriendRequests: toUser.stumbleId } }
      );

      await database.collections.Users.updateOne(
        { stumbleId: toUser.stumbleId },
        { $pull: { receivedFriendRequests: user.stumbleId } }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      return res.status(200).json(updatedUser.userProfile);
    } catch (err) {
      console.error('Friends Cancel error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async list(req, res) {
    try {
      const { user } = req;

      const friends = await database.collections.Users.find({
        stumbleId: { $in: user.friends || [] }
      }).project({
        userProfile: 1
      }).toArray();

      return res.status(200).json({friends: friends.map(f => f.userProfile)});
    } catch (err) {
      console.error('Friends List error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async pending(req, res) {
    try {
      const { user } = req;

      const pendingUsers = await database.collections.Users.find({
        stumbleId: { $in: user.receivedFriendRequests || [] }
      }).project({
        userProfile: 1
      }).toArray();

      return res.status(200).json(pendingUsers.map(u => u.userProfile));
    } catch (err) {
      Console.error('Friends', 'Friends Pending error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async remove(req, res) {
    try {
      const { UserId } = req.params;
      const { user } = req;

      if (!UserId) return res.status(400).json({ message: 'UserId is required' });

      let friend = await UserModel.findById(UserId);
      if (!friend) {
        friend = await UserModel.findByStumbleId(UserId);
      }
      if (!friend) return res.status(404).json({ message: 'User not found' });

      if (!user.friends.includes(friend.stumbleId)) {
        return res.status(404).json({ message: 'Not friends' });
      }

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $pull: { friends: friend.stumbleId } }
      );

      await database.collections.Users.updateOne(
        { stumbleId: friend.stumbleId },
        { $pull: { friends: user.stumbleId } }
      );

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      return res.status(200).json(updatedUser.userProfile);
    } catch (err) {
      Console.error('Friends', 'Friends Remove error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async search(req, res) {
    try {
      const { UserName } = req.body;

      if (!UserName || UserName.length < 3) {
        Console.log("Friends", `Invalid UserName: ${UserName}`);
        return res.status(400).json({ message: 'UserName must be at least 3 characters' });
      }

      const user = await database.collections.Users.findOne(
        { username: { $regex: UserName, $options: 'i' } },
        { projection: { userProfile: 1 } }
      );

      if (!user) {
        Console.log("Friends", `User not found: ${UserName}`);
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json(user.userProfile);
    } catch (err) {
      Console.error('Friends', 'Friends Search error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async inviteToParty(req, res) {
    try {
      const { user } = req;
      const { UserId } = req.body;

      if (!UserId) return res.status(400).json({ message: 'UserId is required' });

      let targetUser = await UserModel.findById(UserId);
      if (!targetUser) {
        targetUser = await UserModel.findByStumbleId(UserId);
      }

      if (!targetUser) return res.status(404).json({ message: 'User not found' });

      const invite = {
        fromUserId: user.id,
        fromUsername: user.username,
        fromStumbleId: user.stumbleId,
        sentAt: new Date().toISOString()
      };

      await database.collections.Users.updateOne(
        { stumbleId: targetUser.stumbleId },
        { $addToSet: { receivedPartyInvites: invite } }
      );

      Console.log('Friends', `User ${user.username} invited ${targetUser.username} to party`);
      return res.status(200).json({ message: 'Invite sent' });
    } catch (err) {
      Console.error('Friends', 'Invite error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async respondToInvite(req, res) {
    try {
      const { user } = req;
      const { FromUserId, Accept } = req.body;

      if (!FromUserId) return res.status(400).json({ message: 'FromUserId is required' });

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { $pull: { receivedPartyInvites: { fromUserId: FromUserId } } }
      );

      return res.status(200).json({ message: Accept ? 'Accepted' : 'Declined' });
    } catch (err) {
      Console.error('Friends', 'Respond Invite error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}


class NewsController {
  static async GetNews(req, res) {
    try {
      const newsList = await database.collections.News
        .find()
        .sort({ timestamp: -1 })
        .toArray();

      const news = newsList.map(news => {
        const ts = news.timestamp;
        const isMs = ts > 9999999999;
        const date = new Date(isMs ? ts : ts * 1000);

        return {
          Header: news.header,
          Message: news.message,
          Date: date.toLocaleString('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        };
      });

      res.json(news);
    } catch (err) {
      Console.error('News', 'Get error:', err);
      res.status(500).json({ message: 'Error fetching news' });
    }
  }
}

class MissionsController {
  static async getMissions(req, res) {
    try {
      const { user } = req;

      const missions = SharedData.MissionObjectives.map(mission => ({
        missionId: mission.Id,
        missionActive: true,
        rewardsClaimed: false,
        requirementProgressions: mission.Requirements.map(req => ({
          requirementId: req.Id,
          completed: Math.random() > 0.5,
          current: Math.floor(Math.random() * req.Target),
          target: req.Target
        }))
      }));

      res.json({
        missionObjectiveProgressionUpdated: {
          missionObjectiveId: "daily",
          currentPoints: Math.floor(Math.random() * 100),
          milestoneProgressions: SharedData.MissionObjectives
            .find(m => m.Id === "daily")?.Milestones.map(milestone => ({
              milestoneId: milestone.MilestoneId,
              claimed: false
            })) || []
        },
        missionsProgressionsUpdated: missions
      });
    } catch (err) {
      Console.error('Missions', 'Get error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async claimMissionReward(req, res) {
    try {
      const { user } = req;
      const { missionId } = req.params;

      const mission = SharedData.MissionObjectives
        .flatMap(m => m.Requirements.map(r => ({ ...r, missionId: m.Id })))
        .find(m => m.missionId === missionId);

      if (!mission) {
        return res.status(404).json({ message: 'Mission not found' });
      }

      const rewards = mission.Rewards || [];
      for (const reward of rewards) {
        if (reward.type === 'CURRENCY') {
          await UserModel.addBalance(user.deviceId, reward.typeInfo, reward.amount);
        }
      }

      const updatedUser = await UserModel.findByDeviceId(user.deviceId);
      res.json({
        User: updatedUser,
        Rewards: rewards,
        message: 'Rewards claimed successfully'
      });
    } catch (err) {
      Console.error('Missions', 'Claim error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async claimMilestoneReward(req, res) {
    try {
      const { user } = req;
      const { objectiveId, milestoneId } = req.params;

      const objective = SharedData.MissionObjectives.find(m => m.Id === objectiveId);
      if (!objective) {
        return res.status(404).json({ message: 'Objective not found' });
      }

      const milestone = objective.Milestones.find(m => m.MilestoneId === milestoneId);
      if (!milestone) {
        return res.status(404).json({ message: 'Milestone not found' });
      }

      const rewards = milestone.Rewards || [];
      for (const reward of rewards) {
        if (reward.type === 'CURRENCY') {
          await UserModel.addBalance(user.deviceId, reward.typeInfo, reward.amount);
        }
      }

      const updatedUser = await UserModel.findByDeviceId(user.deviceId);
      res.json({
        User: updatedUser,
        Rewards: rewards,
        message: 'Milestone rewards claimed successfully'
      });
    } catch (err) {
      Console.error('Missions', 'Claim milestone error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

class TournamentXController {
  static tournamentsPool = [
    {
      id: 2,
      type: 1,
      isEnabled: true,
      minVersion: "0.50",
      name: "1v1 BlockDash Legendary",
      nameKey: "1v1 BlockDash Legendary",
      descriptionKey: "1v1 mode on Block Dash Legendary. Face off against an opponent in a fast-paced match and test your obstacle-dodging skills. Each win rewards you with 100 gems, only the best come out on top.",
      listItemBackgroundImage: "STPBlockDash_Background_Image_Tournaments_Card",
      detailsPanelBackgroundImage: "STPBlockDash_Background_Image_Tournaments",
      prizeBannerColour: "#0008ff",
      headerColour: "#001580",
      mapListGradientColourTop: "#0037ff",
      mapListGradientColourBottom: "#001640",
      detailsPanelBorderColourTop: "#002aff",
      detailsPanelBorderColourBottom: "#001180",
      colourData: {
        detailsPanelMainColour: "#4f7eff",
        detailsPanelBorderColour: "#2352ff",
        headerGradientRight: "#4f75ff",
        headerGradientLeft: "#1e4bff",
        infoWidgetsGradientRight: "#4f7eff",
        infoWidgetsGradientLeft: "#2050ff",
        infoWidgetsBorderColour: "#578cff"
      },
      listPriority: 1,
      minPlayers: 2,
      maxPlayers: 2,
      maxRounds: 1,
      minMatchmakingSeconds: 5,
      entryCurrencyType: "gems",
      entryCurrencyCost: 50,
      entryCurrencyType2: "gems",
      entryCurrencyCost2: 50,
      areEmotesRestricted: true,
      prohibitedEmotes: [2, 4, 5, 6],
      rounds: [{ roundOrder: 1, maxPlayersToProgress: 1, minPlayersPerMatch: 2, maxPlayersPerMatch: 2, areLevelsRestricted: true, permittedLevels: ["eventlevel13_block_legendary"] }],
      awards: [{ placementRangeLowest: 1, placementRangeHighest: 1, awardId: 4, type: "CURRENCY", amount: 100, awardJson: { name: "gems" } }]
    },
    {
      id: 3,
      type: 1,
      isEnabled: true,
      minVersion: "0.50",
      name: "1v1 Laser Tracer",
      nameKey: "1v1 Laser Tracer",
      descriptionKey: "1v1 mode on Laser Tracer. Dodge fast-moving laser beams and outlast your opponent in an intense reflex-based battle. Each win rewards you with 100 gems, precision and timing are key to victory.",
      listItemBackgroundImage: "AbductedAvenue_Background_Image_Tournaments_Card",
      detailsPanelBackgroundImage: "AbductedAvenue_Background_Image_Tournaments",
      prizeBannerColour: "#39FF14",
      headerColour: "#006400",
      mapListGradientColourTop: "#39FF14",
      mapListGradientColourBottom: "#008102",
      detailsPanelBorderColourTop: "#39FF14",
      detailsPanelBorderColourBottom: "#006400",
      colourData: {
        detailsPanelMainColour: "#4fff5e",
        detailsPanelBorderColour: "#008724",
        headerGradientRight: "#5bff4f",
        headerGradientLeft: "#078c00",
        infoWidgetsGradientRight: "#4fff6f",
        infoWidgetsGradientLeft: "#3bff69",
        infoWidgetsBorderColour: "#6fff8c"
      },
      listPriority: 2,
      minPlayers: 2,
      maxPlayers: 2,
      maxRounds: 1,
      minMatchmakingSeconds: 5,
      entryCurrencyType: "gems",
      entryCurrencyCost: 50,
      entryCurrencyType2: "gems",
      entryCurrencyCost2: 50,
      areEmotesRestricted: true,
      prohibitedEmotes: [2, 4, 5, 6],
      rounds: [{ roundOrder: 1, maxPlayersToProgress: 1, minPlayersPerMatch: 2, maxPlayersPerMatch: 2, areLevelsRestricted: true, permittedLevels: ["level15_laser"] }],
      awards: [{ placementRangeLowest: 1, placementRangeHighest: 1, awardId: 4, type: "CURRENCY", amount: 100, awardJson: { name: "gems" } }]
    },
    {
      id: 4,
      type: 1,
      isEnabled: true,
      minVersion: "0.50",
      name: "1v1 Laser Dash",
      nameKey: "1v1 Laser Dash",
      descriptionKey: "1v1 mode on Laser Dash. Race, dodge, and survive through fast-paced laser obstacles while competing against your opponent. Each win rewards you with 100 gems, speed and precision decide the winner.",
      listItemBackgroundImage: "Card_Neon",
      detailsPanelBackgroundImage: "Hub_Neon",
      prizeBannerColour: "#0073ff",
      headerColour: "#003c80",
      mapListGradientColourTop: "#0099ff",
      mapListGradientColourBottom: "#001738",
      detailsPanelBorderColourTop: "#007bff",
      detailsPanelBorderColourBottom: "#001c80",
      colourData: {
        detailsPanelMainColour: "#0027a7",
        detailsPanelBorderColour: "#1f41ff",
        headerGradientRight: "#4f75ff",
        headerGradientLeft: "#000a91",
        infoWidgetsGradientRight: "#263cff",
        infoWidgetsGradientLeft: "#0013a6",
        infoWidgetsBorderColour: "#433fff"
      },
      listPriority: 3,
      minPlayers: 2,
      maxPlayers: 2,
      maxRounds: 1,
      minMatchmakingSeconds: 5,
      entryCurrencyType: "gems",
      entryCurrencyCost: 50,
      entryCurrencyType2: "gems",
      entryCurrencyCost2: 50,
      areEmotesRestricted: true,
      prohibitedEmotes: [2, 4, 5, 6],
      rounds: [{ roundOrder: 1, maxPlayersToProgress: 1, minPlayersPerMatch: 2, maxPlayersPerMatch: 2, areLevelsRestricted: true, permittedLevels: ["eventlevel1_dash"] }],
      awards: [{ placementRangeLowest: 1, placementRangeHighest: 1, awardId: 4, type: "CURRENCY", amount: 100, awardJson: { name: "gems" } }]
    },
    {
      id: 5,
      type: 1,
      isEnabled: true,
      minVersion: "0.50",
      name: "1v1 Banana Only",
      nameKey: "1v1 Banana Only",
      descriptionKey: "1v1 mode on Rush Hour. Navigate through heavy traffic and outspeed your opponent in this urban race. Each win rewards you with 100 gems, speed and agility are your best friends.",
      listItemBackgroundImage: "Premium_LBD_Background_Image_Tournaments_Card",
      detailsPanelBackgroundImage: "Premium_LBD_Background_Image_Tournaments",
      prizeBannerColour: "#5900ff",
      headerColour: "#2d0080",
      mapListGradientColourTop: "#8800ff",
      mapListGradientColourBottom: "#490073",
      detailsPanelBorderColourTop: "#8c00ff",
      detailsPanelBorderColourBottom: "#350080",
      colourData: {
        detailsPanelMainColour: "#9e5eff",
        detailsPanelBorderColour: "#460087",
        headerGradientRight: "#9e4fff",
        headerGradientLeft: "#54008c",
        infoWidgetsGradientRight: "#b26fff",
        infoWidgetsGradientLeft: "#9a3bff",
        infoWidgetsBorderColour: "#c08cff"
      },
      listPriority: 4,
      minPlayers: 2,
      maxPlayers: 2,
      maxRounds: 1,
      minMatchmakingSeconds: 5,
      entryCurrencyType: "gems",
      entryCurrencyCost: 50,
      entryCurrencyType2: "gems",
      entryCurrencyCost2: 50,
      areEmotesRestricted: true,
      prohibitedEmotes: [2, 4, 5, 6],
      rounds: [{ roundOrder: 1, maxPlayersToProgress: 1, minPlayersPerMatch: 2, maxPlayersPerMatch: 2, areLevelsRestricted: true, permittedLevels: ["level15_laser", "eventlevel1_dash", "level24_streamtiles"] }],
      awards: [{ placementRangeLowest: 1, placementRangeHighest: 1, awardId: 4, type: "CURRENCY", amount: 100, awardJson: { name: "gems" } }]
    }
  ];

  static tournaments = [];

  static seasons = [
    {
      awards: [
        { amount: 100, awardId: 1, awardJson: { name: "gems" }, type: "CURRENCY", xp: 5 },
        { amount: 3000, awardId: 2, awardJson: { name: "gems" }, type: "CURRENCY", xp: 10 },
        { amount: 5000, awardId: 3, awardJson: { name: "gems" }, type: "CURRENCY", xp: 15 },
        { amount: 10000, awardId: 4, awardJson: { name: "gems" }, type: "CURRENCY", xp: 20 },
        { amount: 11000, awardId: 5, awardJson: { name: "gems" }, type: "CURRENCY", xp: 25 },
        { amount: 12000, awardId: 6, awardJson: { name: "gems" }, type: "CURRENCY", xp: 30 },
        { amount: 13000, awardId: 7, awardJson: { name: "gems" }, type: "CURRENCY", xp: 35 },
        { amount: 14000, awardId: 8, awardJson: { name: "gems" }, type: "CURRENCY", xp: 40 },
        { amount: 15000, awardId: 9, awardJson: { name: "gems" }, type: "CURRENCY", xp: 45 },
        { amount: 16000, awardId: 10, awardJson: { name: "gems" }, type: "CURRENCY", xp: 50 },
        { amount: 17000, awardId: 11, awardJson: { name: "gems" }, type: "CURRENCY", xp: 55 },
        { amount: 18000, awardId: 12, awardJson: { name: "gems" }, type: "CURRENCY", xp: 60 },
        { amount: 19000, awardId: 13, awardJson: { name: "gems" }, type: "CURRENCY", xp: 65 },
        { amount: 20000, awardId: 14, awardJson: { name: "gems" }, type: "CURRENCY", xp: 70 },
        { amount: 21000, awardId: 15, awardJson: { name: "gems" }, type: "CURRENCY", xp: 75 },
        { amount: 22000, awardId: 16, awardJson: { name: "gems" }, type: "CURRENCY", xp: 80 },
        { amount: 23000, awardId: 17, awardJson: { name: "gems" }, type: "CURRENCY", xp: 85 },
        { amount: 24000, awardId: 18, awardJson: { name: "gems" }, type: "CURRENCY", xp: 90 },
        { amount: 25000, awardId: 19, awardJson: { name: "gems" }, type: "CURRENCY", xp: 95 },
        { amount: 26000, awardId: 20, awardJson: { name: "gems" }, type: "CURRENCY", xp: 100 },
        { amount: 27000, awardId: 21, awardJson: { name: "gems" }, type: "CURRENCY", xp: 105 },
        { amount: 28000, awardId: 22, awardJson: { name: "gems" }, type: "CURRENCY", xp: 110 },
        { amount: 29000, awardId: 23, awardJson: { name: "gems" }, type: "CURRENCY", xp: 115 },
        { amount: 30000, awardId: 24, awardJson: { name: "gems" }, type: "CURRENCY", xp: 120 },
        { amount: 31000, awardId: 25, awardJson: { name: "gems" }, type: "CURRENCY", xp: 125 },
        { amount: 32000, awardId: 26, awardJson: { name: "gems" }, type: "CURRENCY", xp: 130 },
        { amount: 33000, awardId: 27, awardJson: { name: "gems" }, type: "CURRENCY", xp: 135 },
        { amount: 34000, awardId: 28, awardJson: { name: "gems" }, type: "CURRENCY", xp: 140 },
        { amount: 35000, awardId: 29, awardJson: { name: "gems" }, type: "CURRENCY", xp: 145 },
        { amount: 36000, awardId: 30, awardJson: { name: "gems" }, type: "CURRENCY", xp: 150 },
        { amount: 1, awardId: 31, awardJson: { name: "SKINID343" }, type: "CURRENCY", xp: 999 }
      ],
      backgroundImageKey: "",
      descriptionKey: "",
      endTime: "2026-07-01T10:00:00",
      id: 1,
      isEnabled: true,
      nameKey: "TOURNAMENTS",
      startTime: "2024-03-06T10:00:00"
    }
  ];

  static getSeasons(req, res) {
    try {
      const rotationHour = 22;
      const msInDay = 24 * 60 * 60 * 1000;
      const offset = rotationHour * 60 * 60 * 1000;
      const rotationSeed = Math.floor((Date.now() - offset) / msInDay);
      const endTime = new Date((rotationSeed + 1) * msInDay + offset);

      const seasons = TournamentXController.seasons.map(s => ({
        ...s,
        endTime: endTime.toISOString()
      }));

      res.status(200).json(seasons);
    } catch (err) {
      res.status(500).json({ message: "erro interno" });
    }
  }

  static generateEncryptedEntry(partyData, userData) {
    const dataToEncrypt = {
      partyId: partyData.partyId,
      tournamentId: partyData.tournamentId,
      userId: userData.id,
      stumbleId: userData.stumbleId,
      username: userData.username,
      timestamp: Date.now(),
      players: partyData.players.map(p => ({
        stumbleId: p.stumbleId,
        username: p.username
      }))
    };

    const jsonString = JSON.stringify(dataToEncrypt);
    return CryptoUtils.Encrypt(jsonString);
  }

  static getActive(req, res) {
    try {
      const { user } = req;
      const now = new Date();
      // Rotação diária às 22:00 (10 PM)
      const rotationHour = 22;
      const msInDay = 24 * 60 * 60 * 1000;
      
      // Ajusta para o horário de rotação (UTC por padrão, pode ser ajustado se necessário)
      const offset = rotationHour * 60 * 60 * 1000;
      const rotationSeed = Math.floor((Date.now() - offset) / msInDay);
      
      const pool = TournamentXController.tournamentsPool;
      const totalPool = pool.length;
      
      // Seleciona 1v1 RC (fixo) + 2 torneios rotativos do pool (BDL, BD LASER, Laser Dash)
      // Pool: [0: BDL, 1: BD LASER, 2: Laser Dash, 3: 1v1 RC]
      const activeIndices = [
        3, // 1v1 RC sempre presente
        (rotationSeed) % 3,
        (rotationSeed + 1) % 3
      ];

      const startTime = new Date(rotationSeed * msInDay + offset);
      const endTime = new Date((rotationSeed + 1) * msInDay + offset);

      const rankData = UserModel.getRankData(user.skillRating || 0);
      const assets = UserModel.getRankAssets(rankData.rankId);

      const activeTournaments = activeIndices.map((idx, i) => {
        const t = { ...pool[idx] };
        t.startTime = startTime.toISOString();
        t.endTime = endTime.toISOString();
        t.StartDateTime = startTime.toISOString();
        t.EndDateTime = endTime.toISOString();
        t.Visible = true;

        // Força a ausência de bots no backend
        t.maxBots = 0;
        t.minBots = 0;
        t.startingUsers = t.maxPlayers;
        if (t.rounds) {
          t.rounds.forEach(r => {
            r.maxBots = 0;
            r.minBots = 0;
          });
        }

        // O primeiro torneio (idx 0) será o de ranked dinâmico
        if (i === 0) {
          t.name = t.nameKey;
          t.listPriority = 100;
        }

        return t;
      });

      // Atualiza para uso em outras rotas
      TournamentXController.tournaments = activeTournaments;

      res.status(200).json({ 
        AreAdditionalTournamentsVersionRestricted: false, 
        UserActiveTournaments: activeTournaments,
        gameEvents: activeTournaments,
        GameEvents: activeTournaments
      });
    } catch (err) {
      console.error("erro:", err);
      res.status(500).json({ message: "erro interno" });
    }
  }

  static async join(req, res) {
    try {
      const { user } = req;
      const tournamentId = parseInt(req.params.tournamentId);
      const tournament = TournamentXController.tournaments.find(t => t.id === tournamentId);

      if (!tournament) {
        Console.log("BeastArena", `Tournament not found: ${tournamentId}`);
        return res.status(404).json({ message: "torneio nao encontrado" });
      }
      if (!tournament.isEnabled) {
        Console.log("BeastArena", `Tournament disabled: ${tournamentId}`);
        return res.status(400).json({ message: "torneio desativado" });
      }

      // Validação de tempo removida para permitir strings personalizadas no lobby
      /*
      const now = new Date();
      if (now < tournament.startTime || now > tournament.endTime) {
        Console.log("BeastArena", `Tournament not active: ${tournamentId}`);
        return res.status(400).json({ message: "torneio nao esta ativo no momento" });
      }
      */

      if (tournament.entryCurrencyCost > 0) {
        const userBalance = UserModel.getBalanceAmount(user, tournament.entryCurrencyType);
        if (userBalance < tournament.entryCurrencyCost) {
          Console.log("BeastArena", `Insufficient balance for user ${user.username} to join tournament ${tournamentId}`);
          return res.status(400).json({
            message: `saldo insuficiente de ${tournament.entryCurrencyType}`
          });
        }
        await UserModel.removeBalance(user.deviceId, tournament.entryCurrencyType, tournament.entryCurrencyCost);
      }

      const existingParty = await database.collections.Parties.findOne({
        tournamentId: tournament.id,
        "players.stumbleId": user.stumbleId
      });

      if (existingParty) {
        await database.collections.Parties.deleteOne({ partyId: existingParty.partyId });
      }

      let availableParty = await database.collections.Parties.findOne({
        tournamentId: tournament.id,
        $expr: { $lt: [{ $size: "$players" }, tournament.maxPlayers] },
        status: "waiting"
      });

      if (!availableParty) {
        availableParty = {
          partyId: Math.floor(Math.random() * (999999 - 111111 + 1)) + 111111,
          tournamentId: tournament.id,
          tournamentName: tournament.nameKey,
          players: [],
          status: "waiting",
          createdAt: new Date(),
          maxPlayers: tournament.maxPlayers
        };
        await database.collections.Parties.insertOne(availableParty);
      }

      const playerData = {
        stumbleId: user.stumbleId,
        userId: user.id,
        username: user.username,
        joinedAt: new Date()
      };

      await database.collections.Parties.updateOne(
        { partyId: availableParty.partyId },
        { $push: { players: playerData } }
      );

      const updatedParty = await database.collections.Parties.findOne({ partyId: availableParty.partyId });

      if (updatedParty.players.length >= tournament.maxPlayers) {
        await database.collections.Parties.updateOne(
          { partyId: availableParty.partyId },
          { $set: { status: "full" } }
        );
      }

      const encryptedEntry = TournamentXController.generateEncryptedEntry(updatedParty, user);

      Console.log("BeastArena", `User ${user.username} is joining tournament ${tournamentId} in party ${availableParty.partyId}`);
      const response = {
        entryToken: tournamentId + Date.now().toString() + Math.floor(1000, 9999).toString(),
        MatchmakerTag: availableParty.partyId,
        requestId: user.stumbleId
      };
     Console.log("BeastArena", `User ${user.username} joined tournament ${tournamentId} in party ${availableParty.partyId}`);
      res.status(200).json(response);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "erro interno do servidor" });
    }
  }

  static async leave(req, res) {
    try {
      const { user } = req;
      const tournamentId = parseInt(req.params.tournamentId);

      const party = await database.collections.Parties.findOne({
        tournamentId: tournamentId,
        "players.stumbleId": user.stumbleId
      });

      if (party) {
        await database.collections.Parties.deleteOne({ partyId: party.partyId });
      }

      const tournament = TournamentXController.tournaments.find(t => t.id === tournamentId);
      if (tournament && tournament.entryCurrencyCost > 0) {
        await UserModel.addBalance(user.deviceId, tournament.entryCurrencyType, tournament.entryCurrencyCost);
      }

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);

      Console.log("BeastArena", `User ${user.username} left tournament ${tournamentId}`);
      res.status(200).json({ 
        User: updatedUser,
        message: "left" 
      });
    } catch (err) {
      Console.error(err);
      res.status(500).json({ message: "internal server error" });
    }
  }

  static async finish(req, res) {
    try {
      const { Round, TournamentId, EntryToken, SignedPayload } = req.body;
      const { user } = req;

      if (typeof Round === 'undefined') {
        Console.log("BeastArena", `Missing Round parameter from user ${user.username}`);
        return res.status(400).json({ mensagem: "precisa do round" });
      }

      const roundResult = parseInt(Round);
      if (isNaN(roundResult)) {
        Console.log("BeastArena", `Invalid round result from user ${user.username}: ${Round}`);
        return res.status(400).json({ mensagem: "round invalido" });
      }

      let gemsChange = 0;
      let crownsChange = 0;
      let pointsChange = 0;
      let xpChange = 10; // XP base por participação (ajustado para subir barra)

      if (roundResult === 1) {
        gemsChange = 65;
        crownsChange = 1;
        pointsChange = 10;
        xpChange = 50; // XP de vitória (ajustado para subir barra)
      } else if (roundResult === 0) {
        crownsChange = 0;
        pointsChange = -10;
        xpChange = 10; // XP de derrota
      }

      const currentCrowns = parseInt(user.userProfile?.crowns ?? user.crowns ?? 0) || 0;
      const currentTrophies = parseInt(user.userProfile?.trophies ?? 0) || 0;
      const currentSkill = parseInt(user.skillRating ?? 0) || 0;
      const currentXp = (user.tournamentSeasons && user.tournamentSeasons[0]?.xp) || 0;

      const updatedUserProfile = {
        ...(user.userProfile || {}),
        crowns: Math.max(0, currentCrowns + crownsChange),
        trophies: Math.max(0, currentTrophies + pointsChange),
        skillRating: Math.max(0, currentSkill + pointsChange),
        experience: (user.userProfile?.experience || 0) + xpChange,
        ranked: UserModel.getRankedObject(currentSkill + pointsChange)
      };

      await database.collections.Users.updateOne(
        { stumbleId: user.stumbleId },
        { 
          $set: { 
            crowns: Math.max(0, (user.crowns || 0) + crownsChange),
            skillRating: Math.max(0, currentSkill + pointsChange),
            userProfile: updatedUserProfile,
            "tournamentSeasons.0.xp": currentXp + xpChange
          } 
        }
      );

      if (gemsChange > 0) {
        await UserModel.addBalance(user.deviceId, "gems", gemsChange);
      }

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);

      const party = await database.collections.Parties.findOne({
        tournamentId: parseInt(TournamentId),
        "players.stumbleId": user.stumbleId
      });

      if (party) {
        await database.collections.Parties.updateOne(
          { partyId: party.partyId, "players.stumbleId": user.stumbleId },
          { 
            $set: { 
              "players.$.result": roundResult,
              "players.$.finishedAt": new Date(),
              status: "finished"
            } 
          }
        );
      }

      Console.log("BeastArena", `Finished round for user ${user.username}`);

      const rewards = [];
      if (gemsChange > 0) {
        rewards.push({
          Type: "CURRENCY",
          TypeInfo: "gems",
          Amount: gemsChange
        });
      }
      if (crownsChange > 0) {
        rewards.push({
          Type: "CURRENCY",
          TypeInfo: "crowns",
          Amount: crownsChange
        });
      }
      if (xpChange > 0) {
        rewards.push({
          Type: "TOURNAMENTXP",
          Amount: xpChange
        });
        rewards.push({
          Type: "XP",
          Amount: xpChange
        });
      }
      if (pointsChange > 0) {
        rewards.push({
          Type: "TROPHIES",
          Amount: pointsChange
        });
      }

      res.status(200).json({
        SignedPayload: SignedPayload || "",
        Rewards: rewards,
        CollectedCurrencies: gemsChange > 0 ? [{ type: "gems", amount: gemsChange }] : [],
        User: updatedUser
      });

    } catch (err) {
      Console.error("BeastArena", "Error finishing tournament round:", err);
      res.status(500).json({ mensagem: "erro interno do servidor" });
    }
  }

static async getSeasonProgress(req, res) {
    try {
      const { seasonId } = req.params;
      const { user } = req;

      const foundUser = await UserModel.findByStumbleId(user.stumbleId);

      if (!foundUser) {
        return res.status(404).json("putz vc n existe");
      }

      let userSeasonData = foundUser.tournamentSeasons?.find(season =>
        season.seasonId === parseInt(seasonId)
      );

      if (!userSeasonData) {
        userSeasonData = {
          seasonId: parseInt(seasonId),
          xp: 0,
          claimedAwards: []
        };

        if (!foundUser.tournamentSeasons) {
          foundUser.tournamentSeasons = [userSeasonData];
        } else {
          foundUser.tournamentSeasons.push(userSeasonData);
        }

        await UserModel.update(user.stumbleId, {
          tournamentSeasons: foundUser.tournamentSeasons
        });
      }

      const seasonProgress = {
        seasonId: parseInt(seasonId),
        userId: foundUser.id,
        xp: userSeasonData.xp,
        claimedAwards: userSeasonData.claimedAwards
      };

      res.status(200).json(seasonProgress);

    } catch (err) {
      Console.error('Tournament', 'Get season progress error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async claimSeasonReward(req, res) {
    try {
      const { seasonId, awardId } = req.params;
      const { user } = req;

      const foundUser = await UserModel.findByStumbleId(user.stumbleId);
      if (!foundUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const season = TournamentXController.seasons.find(s => s.id === parseInt(seasonId));
      if (!season) {
        return res.status(404).json({ message: "Season not found" });
      }

      const award = season.awards.find(a => a.awardId === parseInt(awardId));
      if (!award) {
        return res.status(404).json({ message: "Award not found" });
      }

      let userSeasonData = foundUser.tournamentSeasons?.find(s => s.seasonId === parseInt(seasonId));

      if (!userSeasonData) {
        userSeasonData = {
          seasonId: parseInt(seasonId),
          xp: 0,
          claimedAwards: []
        };

        if (!foundUser.tournamentSeasons) {
          foundUser.tournamentSeasons = [userSeasonData];
        } else {
          foundUser.tournamentSeasons.push(userSeasonData);
        }

        await UserModel.update(user.stumbleId, {
          tournamentSeasons: foundUser.tournamentSeasons
        });
      }

      if (userSeasonData.xp < award.xp) {
        return res.status(400).json({ message: "Insufficient XP to claim this award" });
      }

      if (userSeasonData.claimedAwards.includes(parseInt(awardId))) {
        return res.status(400).json({ message: "Award already claimed" });
      }

      let rewards = [];

      if (award.type === "CURRENCY") {
        const currencyName = award.awardJson.name;
        const currencyReward = {
          amount: award.amount,
          duplicateCurrencyAmount: 0,
          nestedRewards: [],
          sourceType: "TOURNAMENT_SEASON",
          type: "CURRENCY",
          typeInfo: currencyName
        };
        rewards.push(currencyReward);
        await UserModel.addBalance(user.stumbleId, currencyName, award.amount);
      } else if (award.type === "SKIN") {
        const skinId = award.awardJson.id;
        const wheelReward = {
          amount: 1,
          duplicateCurrencyAmount: 0,
          nestedRewards: [
            {
              amount: 1,
              duplicateCurrencyAmount: 0,
              nestedRewards: [],
              sourceType: "UNKNOWN",
              type: "SKIN",
              typeInfo: skinId
            }
          ],
          sourceType: "TOURNAMENT_SEASON",
          type: "WHEEL",
          typeInfo: "TOURNAMENT_SEASON_WHEEL"
        };
        rewards.push(wheelReward);
        await UserModel.addSkin(user.stumbleId, skinId);
      } else if (award.type === "EMOTE") {
        const emoteId = award.awardJson.id;
        const wheelReward = {
          amount: 1,
          duplicateCurrencyAmount: 0,
          nestedRewards: [
            {
              amount: 1,
              duplicateCurrencyAmount: 0,
              nestedRewards: [],
              sourceType: "UNKNOWN",
              type: "EMOTE",
              typeInfo: emoteId
            }
          ],
          sourceType: "TOURNAMENT_SEASON",
          type: "WHEEL",
          typeInfo: "TOURNAMENT_SEASON_WHEEL"
        };
        rewards.push(wheelReward);
        await database.addToUserArray({ stumbleId: user.stumbleId }, 'emotes', emoteId);
      } else if (award.type === "FOOTSTEPS") {
        const footstepId = award.awardJson.id;
        const wheelReward = {
          amount: 1,
          duplicateCurrencyAmount: 0,
          nestedRewards: [
            {
              amount: 1,
              duplicateCurrencyAmount: 0,
              nestedRewards: [],
              sourceType: "UNKNOWN",
              type: "FOOTSTEPS",
              typeInfo: footstepId
            }
          ],
          sourceType: "TOURNAMENT_SEASON",
          type: "WHEEL",
          typeInfo: "TOURNAMENT_SEASON_WHEEL"
        };
        rewards.push(wheelReward);
        await database.addToUserArray({ stumbleId: user.stumbleId }, 'footsteps', footstepId);
      }

      userSeasonData.claimedAwards.push(parseInt(awardId));
      await UserModel.update(user.stumbleId, {
        tournamentSeasons: foundUser.tournamentSeasons.map(s =>
          s.seasonId === parseInt(seasonId) ? userSeasonData : s
        )
      });

      const updatedUser = await UserModel.findByStumbleId(user.stumbleId);
      res.status(200).json({
        User: updatedUser,
        Rewards: rewards
      });

    } catch (err) {
      Console.error("TournamentX", "Error claiming season reward:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
  

  static async getPartyInfo(req, res) {
    try {
      const { user } = req;
      const tournamentId = parseInt(req.params.tournamentId);

      const party = await database.collections.Parties.findOne({
        tournamentId: tournamentId,
        "players.stumbleId": user.stumbleId
      });

      if (!party) {
        Console.log("BeastArena", `User ${user.username} is not in any party for tournament ${tournamentId}`);
        return res.status(404).json({ message: "nao esta em nenhuma partida" });
      }

      res.status(200).json({
        partyId: party.partyId,
        tournamentId: party.tournamentId,
        players: party.players,
        status: party.status,
        createdAt: party.createdAt
      });
    } catch (err) {
      Console.error("BeastArena", "Error fetching party info:", err);
      res.status(500).json({ message: "erro interno do servidor" });
    }
  }

  static async cleanupParties() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      await database.collections.Parties.deleteMany({
        createdAt: { $lt: oneHourAgo },
        status: { $in: ["waiting", "finished"] }
      });
Console.log("BeastArena", "Cleaning up old parties");
    } catch (err) {
      Console.error("BeastArena", "Error cleaning up parties:", err);
    }
  }
}

setInterval(() => {
  TournamentXController.cleanupParties();
}, 30 * 60 * 1000);

class MatchmakingController {
  static async getMatchmakingFilter(req, res) {
    try {
      const { deviceId } = req.query;
      
      if (!deviceId) {
        Console.error('Matchmaking', 'Missing deviceId in request');
        return res.status(400).json({ 
          error: "Bad Request",
          message: "deviceId query parameter is required" 
        });
      }

      const user = await UserModel.findByDeviceId(deviceId);
      
      if (!user) {
        Console.error('Matchmaking', `User not found for deviceId: ${deviceId}`);
        return res.status(404).json({ 
          error: "Not Found",
          message: "User not found" 
        });
      }

      const sharedType = process.env.sharedType || 'NULL';
      const version = user.version;

      const matchmakingFilter = `$StumbleZone_${version}_${sharedType}`;

      return res.status(200).json({ matchmakingFilter });
      
    } catch (err) {
      Console.error('Matchmaking', 'Filter error:', err);
      return res.status(500).json({ 
        error: "Internal Server Error",
        message: "An error occurred while generating matchmaking filter" 
      });
    }
  }
}


class SocialController {
  static async getInteractions(req, res) {
    try {
      const { user } = req;

      const friendIds = Array.isArray(user.friends) ? user.friends : [];
      const receivedRequests = Array.isArray(user.receivedFriendRequests) ? user.receivedFriendRequests : [];
      const receivedPartyInvites = Array.isArray(user.receivedPartyInvites) ? user.receivedPartyInvites : [];

      const friends = await database.collections.Users.find({ 
        stumbleId: { $in: friendIds } 
      }).project({ 
        id: 1,
        username: 1, 
        stumbleId: 1, 
        country: 1, 
        skillRating: 1,
        crowns: 1,
        experience: 1,
        equippedCosmetics: 1,
        lastLogin: 1
      }).toArray();

      const friendProfiles = friends.map(friend => ({
        userId: friend.id || 0,
        userName: friend.username || 'Unknown',
        title: "",
        country: friend.country || 'Unknown',
        trophies: friend.skillRating || 0,
        crowns: friend.crowns || 0,
        experience: friend.experience || 0,
        hiddenRating: Math.floor((friend.skillRating || 0) / 10),
        isOnline: true,
        lastSeenDate: friend.lastLogin ? friend.lastLogin.toISOString() : new Date().toISOString(),
        skin: friend.equippedCosmetics?.skin || 'SKIN1',
        nativePlatformName: "android",
        ranked: UserModel.getRankedObject(friend.skillRating),
        flags: 0
      }));

      const pendingUsers = await database.collections.Users.find({
        stumbleId: { $in: receivedRequests }
      }).project({
        id: 1,
        username: 1,
        country: 1,
        skillRating: 1,
        crowns: 1,
        experience: 1,
        equippedCosmetics: 1,
        lastLogin: 1
      }).toArray();

      const friendRequestProfiles = pendingUsers.map(u => ({
        userId: u.id || 0,
        userName: u.username || 'Unknown',
        title: "",
        country: u.country || 'Unknown',
        trophies: u.skillRating || 0,
        crowns: u.crowns || 0,
        experience: u.experience || 0,
        hiddenRating: Math.floor((u.skillRating || 0) / 10),
        isOnline: true,
        lastSeenDate: u.lastLogin ? u.lastLogin.toISOString() : new Date().toISOString(),
        skin: u.equippedCosmetics?.skin || 'SKIN1',
        nativePlatformName: "android",
        ranked: UserModel.getRankedObject(u.skillRating),
        flags: 0
      }));

      const excludeIds = [...friendIds, ...receivedRequests, user.stumbleId].filter(id => id);

      const recommendedUsers = await database.collections.Users.aggregate([
        { 
          $match: { 
            stumbleId: { 
              $exists: true,
              $nin: excludeIds.length > 0 ? excludeIds : ['non-existent-id'] 
            },
            country: { $exists: true }
          }
        },
        { $sample: { size: 5 } },
        { $project: {
          id: 1,
          username: 1,
          country: 1,
          skillRating: 1,
          crowns: 1,
          experience: 1,
          equippedCosmetics: 1,
          lastLogin: 1
        }}
      ]).toArray();

      const recommendedProfiles = recommendedUsers.map(u => {
        const tags = [];
        if (u.country === user.country) tags.push("SAME_COUNTRY");
        if (Math.abs((u.skillRating || 0) - (user.skillRating || 0)) < 200) {
          tags.push("SIMILAR_SKILL");
        }

        return {
          tags: tags.length > 0 ? tags : ["SIMILAR_SKILL"],
          userProfile: {
            userId: u.id || 0,
            userName: u.username || 'Unknown',
            title: "",
            country: u.country || 'Unknown',
            trophies: u.skillRating || 0,
            crowns: u.crowns || 0,
            experience: u.experience || 0,
            hiddenRating: Math.floor((u.skillRating || 0) / 10),
            isOnline: true,
            lastSeenDate: u.lastLogin ? u.lastLogin.toISOString() : new Date().toISOString(),
            skin: u.equippedCosmetics?.skin || 'SKIN1',
            nativePlatformName: "android",
            ranked: UserModel.getRankedObject(u.skillRating),
            flags: 0
          }
        };
      });

      const partyInviteDetails = await Promise.all(
        receivedPartyInvites.map(async (invite) => {
          const fromUser = await database.collections.Users.findOne({ stumbleId: invite.fromStumbleId });
          return {
            fromUserId: invite.fromUserId,
            fromUsername: invite.fromUsername,
            fromStumbleId: invite.fromStumbleId,
            sentAt: invite.sentAt,
            fromUserProfile: fromUser ? {
              userId: fromUser.id || 0,
              userName: fromUser.username || 'Unknown',
              title: "",
              country: fromUser.country || 'Unknown',
              trophies: fromUser.skillRating || 0,
              crowns: fromUser.crowns || 0,
              experience: fromUser.experience || 0,
              hiddenRating: Math.floor((fromUser.skillRating || 0) / 10),
              isOnline: true,
              lastSeenDate: fromUser.lastLogin ? fromUser.lastLogin.toISOString() : new Date().toISOString(),
              skin: fromUser.equippedCosmetics?.skin || 'SKIN1',
              nativePlatformName: "android",
              ranked: UserModel.getRankedObject(fromUser.skillRating),
              flags: 0
            } : null
          };
        })
      );

      // SEMPRE adiciona um convite fake para simular atividade constante de amigos
      let inviter = null;
      if (friends.length > 0) {
        inviter = friends[Math.floor(Math.random() * friends.length)];
      } else if (recommendedUsers.length > 0) {
        inviter = recommendedUsers[Math.floor(Math.random() * recommendedUsers.length)];
      }

      const fakeInvite = {
        fromUserId: inviter ? (inviter.id || 0) : 99999,
        fromUsername: inviter ? (inviter.username || 'Amigo') : 'SG_Zone_Player',
        fromStumbleId: inviter ? (inviter.stumbleId || 'SG_ZONE') : 'SG_ZONE',
        sentAt: new Date().toISOString(),
        fromUserProfile: {
          userId: inviter ? (inviter.id || 0) : 99999,
          userName: inviter ? (inviter.username || 'Amigo') : 'SG_Zone_Player',
          title: "",
          country: inviter ? (inviter.country || 'BR') : 'BR',
          trophies: inviter ? (inviter.skillRating || 0) : 1000,
          crowns: inviter ? (inviter.crowns || 0) : 50,
          experience: inviter ? (inviter.experience || 0) : 100,
          hiddenRating: inviter ? Math.floor((inviter.skillRating || 0) / 10) : 100,
          isOnline: true,
          lastSeenDate: new Date().toISOString(),
          skin: inviter ? (inviter.equippedCosmetics?.skin || 'SKIN1') : 'SKIN1',
          nativePlatformName: "android",
          ranked: UserModel.getRankedObject(inviter ? (inviter.skillRating || 0) : 1000),
          flags: 0
        }
      };
      
      partyInviteDetails.unshift(fakeInvite);

      res.status(200).json({
        friends: friendProfiles,
        friendRequests: friendRequestProfiles,
        partyInvites: partyInviteDetails,
        recommendedFriends: recommendedProfiles
      });

    } catch (err) {
      Console.error('Social', 'Get interactions error:', err);
      Console.log('Social', 'Error details:', err);
      res.status(500).json({
        message: 'erro interno',
        error: err.message 
      });
    }
  }
}

class TournamentController {
    static async login(req, res) {
        try {
            const user = await UserModel.findByDeviceId(req.user.deviceId);
            
            return res.status(200).json({
                userId: user.id,
                clientToken: user.token,
                photonJwt: user.photonJwt
            });

        } catch (error) {
            Console.error('TournamentLogin', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async createTournament(req, res) {
        try {
            const { name, description, startTime, endTime, entryFee, maxPlayers, rewards } = req.body;
            
            if (!name || !startTime || !endTime) {
                return res.status(400).json({ message: 'Name, startTime and endTime are required' });
            }

            const tournament = {
                id: uuidv4(),
                name,
                description: description || "",
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                entryFee: entryFee || 0,
                maxPlayers: maxPlayers || 1000,
                currentPlayers: 0,
                rewards: rewards || [],
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true
            };

            const result = await database.collections.Tournaments.insertOne(tournament);
            
            if (result.acknowledged) {
                res.status(201).json({
                    message: 'Tournament created successfully',
                    tournament
                });
            } else {
                throw new Error('Failed to create tournament');
            }
        } catch (err) {
            Console.error('Tournament', 'Create error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async getActive(req, res) {
        try {
            const now = new Date();
            const activeTournaments = await database.collections.Tournaments.find({
                startTime: { $lte: now },
                endTime: { $gte: now },
                isActive: true
            }).sort({ startTime: 1 }).toArray();

            res.json(activeTournaments);
        } catch (err) {
            Console.error('Tournament', 'Get active error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async getTournamentById(req, res) {
        try {
            const { id } = req.params;
            
            if (!id) {
                return res.status(400).json({ message: 'Tournament ID is required' });
            }

            const tournament = await database.collections.Tournaments.findOne({ id });
            
            if (!tournament) {
                return res.status(404).json({ message: 'Tournament not found' });
            }

            res.json(tournament);
        } catch (err) {
            Console.error('Tournament', 'Get by ID error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async joinTournament(req, res) {
        try {
            const { user } = req;
            const { tournamentId } = req.params;

            if (!tournamentId) {
                return res.status(400).json({ message: 'Tournament ID is required' });
            }

            const tournament = await database.collections.Tournaments.findOne({ 
                id: tournamentId,
                isActive: true
            });

            if (!tournament) {
                return res.status(404).json({ message: 'Tournament not found or inactive' });
            }

            const now = new Date();
            if (now < tournament.startTime) {
                return res.status(400).json({ message: 'Tournament has not started yet' });
            }

            if (tournament.currentPlayers >= tournament.maxPlayers) {
                return res.status(400).json({ message: 'Tournament is full' });
            }

            const existingParticipation = await database.collections.TournamentParticipants.findOne({
                tournamentId,
                userId: user.id
            });

            if (existingParticipation) {
                return res.status(400).json({ message: 'You have already joined this tournament' });
            }

            if (tournament.entryFee > 0) {
                const userBalance = UserModel.getBalanceAmount(user, 'gems');
                if (userBalance < tournament.entryFee) {
                    return res.status(400).json({ message: 'Not enough gems to join tournament' });
                }
                
                await UserModel.removeBalance(user.stumbleId, 'gems', tournament.entryFee);
            }

            await database.collections.TournamentParticipants.insertOne({
                id: uuidv4(),
                tournamentId,
                userId: user.id,
                username: user.username,
                joinTime: new Date(),
                score: 0,
                position: 0,
                rewardsClaimed: false
            });

            await database.collections.Tournaments.updateOne(
                { id: tournamentId },
                { $inc: { currentPlayers: 1 } }
            );

            res.json({
                message: 'Successfully joined tournament',
                tournamentId,
                entryFeePaid: tournament.entryFee
            });

        } catch (err) {
            Console.error('Tournament', 'Join error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async submitTournamentScore(req, res) {
        try {
            const { user } = req;
            const { tournamentId } = req.params;
            const { score } = req.body;

            if (!tournamentId) {
                return res.status(400).json({ message: 'Tournament ID is required' });
            }

            if (typeof score !== 'number' || score < 0) {
                return res.status(400).json({ message: 'Invalid score' });
            }

            const tournament = await database.collections.Tournaments.findOne({ 
                id: tournamentId,
                isActive: true
            });

            if (!tournament) {
                return res.status(404).json({ message: 'Tournament not found or inactive' });
            }

            const participation = await database.collections.TournamentParticipants.findOne({
                tournamentId,
                userId: user.id
            });

            if (!participation) {
                return res.status(400).json({ message: 'You have not joined this tournament' });
            }

            await database.collections.TournamentParticipants.updateOne(
                { id: participation.id },
                { $set: { score: Math.max(participation.score, score) } }
            );

            res.json({
                message: 'Score submitted successfully',
                tournamentId,
                newScore: score,
                previousScore: participation.score
            });

        } catch (err) {
            Console.error('Tournament', 'Submit score error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async getTournamentLeaderboard(req, res) {
        try {
            const { tournamentId } = req.params;
            const { limit = 50 } = req.query;

            if (!tournamentId) {
                return res.status(400).json({ message: 'Tournament ID is required' });
            }

            const tournament = await database.collections.Tournaments.findOne({ 
                id: tournamentId
            });

            if (!tournament) {
                return res.status(404).json({ message: 'Tournament not found' });
            }

            const leaderboard = await database.collections.TournamentParticipants
                .find({ tournamentId })
                .sort({ score: -1 })
                .limit(parseInt(limit))
                .project({
                    id: 1,
                    userId: 1,
                    username: 1,
                    score: 1,
                    position: 1
                })
                .toArray();

            if (leaderboard.length > 0) {
                let currentPosition = 1;
                let previousScore = leaderboard[0].score;

                for (let i = 0; i < leaderboard.length; i++) {
                    if (leaderboard[i].score < previousScore) {
                        currentPosition = i + 1;
                        previousScore = leaderboard[i].score;
                    }
                    leaderboard[i].position = currentPosition;
                }

                await Promise.all(leaderboard.map(async (entry, index) => {
                    await database.collections.TournamentParticipants.updateOne(
                        { 
                            tournamentId,
                            userId: entry.userId
                        },
                        { $set: { position: entry.position } }
                    );
                }));
            }

            res.json({
                tournamentId,
                tournamentName: tournament.name,
                leaderboard
            });

        } catch (err) {
            Console.error('Tournament', 'Leaderboard error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async claimTournamentRewards(req, res) {
        try {
            const { user } = req;
            const { tournamentId } = req.params;

            if (!tournamentId) {
                return res.status(400).json({ message: 'Tournament ID is required' });
            }

            const tournament = await database.collections.Tournaments.findOne({ 
                id: tournamentId
            });

            if (!tournament) {
                return res.status(404).json({ message: 'Tournament not found' });
            }

            const now = new Date();
            if (now < tournament.endTime) {
                return res.status(400).json({ message: 'Tournament has not ended yet' });
            }

            const participation = await database.collections.TournamentParticipants.findOne({
                tournamentId,
                userId: user.id
            });

            if (!participation) {
                return res.status(400).json({ message: 'You did not participate in this tournament' });
            }

            if (participation.rewardsClaimed) {
                return res.status(400).json({ message: 'You have already claimed your rewards' });
            }

            const reward = tournament.rewards.find(r => 
                participation.position >= r.positionRangeLowest && 
                participation.position <= r.positionRangeHighest
            );

            if (!reward) {
                return res.status(400).json({ message: 'No rewards available for your position' });
            }

            switch (reward.type) {
                case 'crowns':
                    await UserModel.addBalance(user.stumbleId, 'crowns', reward.amount);
                    break;
                case 'gems':
                    await UserModel.addBalance(user.stumbleId, 'gems', reward.amount);
                    break;
                case 'skins':
                    await UserModel.addSkin(user.stumbleId, reward.skinId);
                    break;
            }

            await database.collections.TournamentParticipants.updateOne(
                { id: participation.id },
                { $set: { rewardsClaimed: true } }
            );

            res.json({
                message: 'Rewards claimed successfully',
                rewards: reward
            });

        } catch (err) {
            Console.error('Tournament', 'Claim rewards error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async updateTournament(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;

            if (!id) {
                Console.error('Tournament', 'Tournament ID is required');
                return res.status(400).json({ message: 'Tournament ID is required' });
            }

            if (Object.keys(updates).length === 0) {
                Console.error('Tournament', 'No updates provided');
                return res.status(400).json({ message: 'No updates provided' });
            }

            updates.updatedAt = new Date();

            const result = await database.collections.Tournaments.updateOne(
                { id },
                { $set: updates }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ message: 'Tournament not found' });
            }

            const updatedTournament = await database.collections.Tournaments.findOne({ id });

            res.json({
                message: 'Tournament updated successfully',
                tournament: updatedTournament
            });

        } catch (err) {
            Console.error('Tournament', 'Update error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    static async endTournament(req, res) {
        try {
            const { id } = req.params;

            if (!id) {
                Console.error('Tournament', 'Tournament ID is required');
                return res.status(400).json({ message: 'Tournament ID is required' });
            }

            const result = await database.collections.Tournaments.updateOne(
                { id },
                { 
                    $set: { 
                        isActive: false,
                        endTime: new Date(),
                        updatedAt: new Date()
                    } 
                }
            );

            if (result.matchedCount === 0) {
                Console.error('Tournament', 'Tournament not found:', id);
                return res.status(404).json({ message: 'Tournament not found' });
            }

            res.json({ message: 'Tournament ended successfully' });

        } catch (err) {
            Console.error('Tournament', 'End error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}

class EventsController {
  static async getActive(req, res) {
    try {
      const now = new Date();
      // Ativa pelo menos 1 evento forçando datas válidas
      const events = (SharedData.GameEvents || []).map(e => ({
        ...e,
        StartDateTime: "2024-01-01T00:00:00Z", // Data fixa no passado
        EndDateTime: "2027-12-31T23:59:59Z", // Data fixa no futuro
        Visible: true
      }));
      
      res.json({ 
        gameEvents: events,
        GameEvents: events
      });
      Console.log("GameEvents", `Returned ${events.length} active events`);
    } catch (err) {
      Console.error("GameEvents", "Error:", err);
      res.status(500).json([]);
    }
  }
  static async join(req, res) {
    try {
      const { user } = req;
      const { EventId } = req.body || {};
      if (!EventId) {
        Console.log("GameEvents", `User ${user?.username || "Unknown"} missing EventId in request`);
        return res.status(400).json({ message: "eventid requeried" });
      }
      const events = SharedData.GameEvents || [];
      const event = events.find(e => e.Id === EventId);
      if (!event) {
         Console.log("GameEvents", `User ${user?.username || "Unknown"} tried to join non-existent event ${EventId}`);
        return res.status(404).json({ message: "evento nao encontrado" });
      }
      const now = new Date();
      const start = new Date(event.StartDateTime);
      const end = new Date(event.EndDateTime);
      if (!(start <= now && now <= end)) {
         Console.log("GameEvents", `User ${user?.username || "Unknown"} tried to join inactive event ${EventId}`);
        return res.status(400).json({ message: "evento nao esta ativo" });
      }
      const response = {
        EventId,
        status: "joined"
      };
      Console.log("GameEvents", `User ${user?.username || "Unknown"} joined event ${EventId}`);
      return res.status(200).json(response);
    } catch (err) {
      Console.error("GameEvents", "Error:", err);
      return res.status(500).json({ message: "internal error" });
    }
  }
}
class CheatController {
  static async reportCheat(req, res) {
    try {
      const { user } = req;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ 
          success: false, 
          message: 'Reason is required' 
        });
      }

      const cheatReport = {
        id: CryptoUtils.GenerateId(),
        deviceId: user.deviceId,
        reason: reason.trim(),
        timestamp: new Date()
      };

      await database.collections.Anticheat.insertOne(cheatReport);

      Console.log('Anticheat', `cheat report from ${user.username}: ${reason}`);

      return res.status(200).json({ 
        success: true, 
        message: 'Cheat report submitted successfully',
        reportId: cheatReport.id
      });

    } catch (err) {
      Console.error('Anticheat', 'Report error:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }
}

class InventoryController {
  static async addTag(req, res) {
    try {
      const { identifier, tagName } = req.body;
      
      if (!identifier || !tagName) {
        Console.error('Inventory', 'Missing identifier or tagName in request body');
        return res.status(400).json({ message: 'Identifier and tagName are required' });
      }

      const finalTag = tagName;

      let user;
      if (!isNaN(identifier)) {
        user = await UserModel.findById(parseInt(identifier));
      } else {
        user = await database.getUserByQuery({ 
          username: { $regex: new RegExp(`^${identifier}$`, 'i') } 
        });
      }

      if (!user) {
        Console.error('Inventory', 'User not found:', identifier);
        return res.status(404).json({ message: 'User not found' });
      }

      const existingTag = user.inventory.find(item => 
        item.itemType === "TAG" && item.item === finalTag
      );

      if (existingTag) {
        Console.error('Inventory', 'User already has this tag:', user.id);
        return res.status(409).json({ message: 'User already has this tag' });
      }

      const newTagItem = {
        userId: user.id,
        itemId: Math.floor(Math.random() * 10000) + 8000,
        itemType: "TAG",
        item: finalTag,
        amount: 1,
        acquiredDate: new Date()
      };

      await database.collections.Users.updateOne(
        { id: user.id },
        { $push: { inventory: newTagItem } }
      );

      const updatedUser = await UserModel.findById(user.id);
      
      res.status(200).json({ 
        message: 'Tag added successfully',
        tag: finalTag,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          stumbleId: updatedUser.stumbleId
        }
      });

    } catch (err) {
      Console.error('Inventory', 'Error adding tag:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async removeTag(req, res) {
    try {
      const { identifier, tagName } = req.body;
      
      if (!identifier || !tagName) {
        return res.status(400).json({ message: 'Identificador e nome da tag sao obrigatorios' });
      }

      const tagToFind = tagName;

      let user;
      if (!isNaN(identifier)) {
        user = await UserModel.findById(parseInt(identifier));
      } else {
        user = await database.getUserByQuery({ 
          username: { $regex: new RegExp(`^${identifier}$`, 'i') } 
        });
      }

      if (!user) {
        Console.error('Inventory', 'User not found:', identifier);
        return res.status(404).json({ message: 'User not found' });
      }

      const tagToRemove = user.inventory.find(item => 
        item.itemType === "TAG" && item.item === tagToFind
      );

      if (!tagToRemove) {
        Console.error('Inventory', 'User does not have this tag:', user.id);
        return res.status(404).json({ message: 'Este usuario nao possui esta tag' });
      }

      await database.collections.Users.updateOne(
        { id: user.id },
        { $pull: { inventory: { itemId: tagToRemove.itemId } } }
      );

      const updatedUser = await UserModel.findById(user.id);
      
      res.status(200).json({ 
        message: 'Tag removed successfully',
        removedTag: tagToRemove.item,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          stumbleId: updatedUser.stumbleId
        }
      });

    } catch (err) {
      Console.error('Inventory', 'Error removing tag:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  static async listTags(req, res) {
    try {
      const { identifier } = req.body;
      
      if (!identifier) {
        Console.error('Inventory', 'Missing identifier in request body');
        return res.status(400).json({ message: 'Identificador do usuaril e obrigatorio' });
      }

      let user;
      if (!isNaN(identifier)) {
        user = await UserModel.findById(parseInt(identifier));
      } else {
        user = await database.getUserByQuery({ 
          username: { $regex: new RegExp(`^${identifier}$`, 'i') } 
        });
      }

      if (!user) {
        Console.error('Inventory', `User not found: ${identifier}`);
        return res.status(404).json({ message: 'User not found' });
      }

      const tags = user.inventory.filter(item => item.itemType === "TAG");
      
      res.status(200).json({ 
        userId: user.id,
        userName: user.username,
        tags: tags.map(tag => ({
          itemId: tag.itemId,
          tag: tag.item,
          amount: tag.amount,
          acquiredDate: tag.acquiredDate
        }))
      });

    } catch (err) {
      Console.error('Inventory', 'Error listing tags:', err);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  }
}



class CreatorCodeController {
  static async support(req, res) {
    try {
      const { Code } = req.body;
      const { user } = req;

      if (!Code) {
        Console.error('CreatorCode', 'Missing Code in request body');
        return res.status(400).json({ message: 'code e obrigatorio' });
      }

      const creator = await database.collections.CreatorCodes.findOne({ creatorCode: Code });
      if (!creator) {
        Console.error('CreatorCode', 'Invalid creator code:', Code);
        return res.status(404).json({ message: 'creator code invalido' });
      }

      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 15);

      const foundUser = await UserModel.findByStumbleId(user.stumbleId);
      if (!foundUser) {
        Console.error('CreatorCode', 'User not found for stumbleId:', user.stumbleId);
        return res.status(404).json({ message: 'usuario nao encontrado' });
      }

      await UserModel.update(user.stumbleId, {
        "userProfile.creatorCode.code": Code,
        "userProfile.creatorCode.expirationDate": expirationDate,
      });

      res.json({ code: Code, expirationDate });
    } catch {
      res.status(500).json({ message: 'erro interno' });
    }
  }

  static async stopSupport(req, res) {
    try {
      const { user } = req;

      const foundUser = await UserModel.findByStumbleId(user.stumbleId);
      if (!foundUser) {
        Console.error('CreatorCode', 'User not found for stumbleId:', user.stumbleId);
        return res.status(404).json({ message: 'usuario nao encontrado' });
      }

      await UserModel.update(user.stumbleId, {
        "userProfile.creatorCode.code": "NOSUPORT"
      });

      res.json({ code: "" });
    } catch {
      res.status(500).json({ message: 'erro interno' });
    }
  }

  static async getCreator(req, res) {
    try {
      const { user } = req;

      const foundUser = await UserModel.findByStumbleId(user.stumbleId);
      if (!foundUser || !foundUser.userProfile || !foundUser.userProfile.creatorCode || foundUser.userProfile.creatorCode.code === "NOSUPORT") {
        Console.error('CreatorCode', 'No creator code found for user:', user.stumbleId);
        return res.status(404).json({ message: 'nenhum creator code encontrado' });
      }

      const { code, expirationDate } = foundUser.userProfile.creatorCode;
      res.json({ code, expirationDate });
    } catch {
      res.status(500).json({ message: 'erro interno' });
    }
  }
}










function errorControll(err, req, res, next) {
  Console.error('Unhandled', 'Error:', err);
  res.status(500).json({ message: 'Internal server error' });
}

async function sendShared(req, res) {
  try {
    Console.log("Shared", "Sending shared to player");
    const data = JSON.parse(JSON.stringify(SharedData));

    // Garante que o BackendUrl esteja sempre correto para mobile
    data.BackendUrl = process.env.BACKEND_URL || "https://stumblezone.onrender.com";
    
    // Configurações de Versão Universal para Mobile
    if (!data.Versions) data.Versions = {};
    data.Versions.AndroidLastVersionAvailable = "0.56";
    data.Versions.IOSLastVersionAvailable = "0.56";
    data.Versions.SteamLastVersionAvailable = "0.56";
    data.Versions.Max = "0.56";
    data.Versions.MaxIOS = "0.56";
    data.Versions.MinimumVersionToPlay = "0.1";

    // Ativa flags importantes (Compatibilidade v1 e v2)
    data.NewsVersion = 2;
    data.AvailableNewsVersion = 2;
    
    // Formato Objeto (v1)
    if (!data.FeatureFlags) data.FeatureFlags = {};
    data.FeatureFlags.IPL_056_Dancefloor = true;
    data.FeatureFlags.IPL_056_CustomParty = true;
    data.FeatureFlags.IPL_056_TournamentX = true;
    data.FeatureFlags.FriendsList = true;
    data.FeatureFlags.TournamentsX = true;
    data.FeatureFlags.Events = true;
    data.FeatureFlags.News = true;
    data.FeatureFlags.CustomParty = true;
    data.FeatureFlags.NewMatchmaking = true;

    // Formato Lista de Objetos (v2)
    data.FeatureFlagsList = [
      { "Flag": "IPL_056_Dancefloor", "Enabled": true },
      { "Flag": "FriendsList", "Enabled": true },
      { "Flag": "TournamentsX", "Enabled": true },
      { "Flag": "TournamentsXMeta", "Enabled": true },
      { "Flag": "Events", "Enabled": true },
      { "Flag": "News", "Enabled": true },
      { "Flag": "CustomParty", "Enabled": true },
      { "Flag": "NewMatchmaking", "Enabled": true }
    ];

    // Formato Lista de Strings (v2 Alternativo)
    data.FeatureFlag = [
      "Missions",
      "FriendsList",
      "TournamentsX",
      "TournamentsXMeta",
      "Events",
      "News",
      "CustomParty",
      "NewMatchmaking",
      "IPL_056_Dancefloor"
    ];

    // Se o cliente esperar FeatureFlags como array (comum em v2)
    if (Array.isArray(data.FeatureFlags)) {
      data.FeatureFlags = data.FeatureFlagsList;
    } else {
      // Se for objeto, mantemos as propriedades e adicionamos a lista separada
      data.FeatureFlagsV2 = data.FeatureFlagsList;
    }

    // Ativa eventos e torneios
    if (Array.isArray(data.GameEvents)) {
      data.GameEvents = data.GameEvents.map(e => ({
        ...e,
        StartDateTime: "2024-01-01T00:00:00Z",
        EndDateTime: "2027-12-31T23:59:59Z",
        Visible: true
      }));
    }

    // Mostrar Torneios do TournamentX
    if (data.UserActiveTournaments) {
      data.UserActiveTournaments = data.UserActiveTournaments.map(t => ({
        ...t,
        isEnabled: true
      }));
    }

    // Se houver roletas no shared.json, garante que elas estejam habilitadas e gratuitas
    let wheels = null;
    if (data.ShopDef && Array.isArray(data.ShopDef.LuckySpinWheels)) {
      wheels = data.ShopDef.LuckySpinWheels;
    } else if (Array.isArray(data.LuckySpinWheels)) {
      wheels = data.LuckySpinWheels;
    }

    if (wheels) {
      wheels.forEach(wheel => {
        wheel.IsEnabled = true;
        wheel.Price = 0;
        wheel.AdPrice = 0;
        wheel.AdSpinMaxAmountPerCycle = 999;
        wheel.FreeSpinMaxAmountPerCycle = 999;
        wheel.AdSpinCooldownSeconds = 0;
        wheel.GlobalResetTimeSeconds = 0;
        wheel.AdSpinCooldownSeconds = 0;
        wheel.AdSpinMaxAmountPerCycle = 100;
        wheel.FreeSpinMaxAmountPerCycle = 100;
        wheel.Platforms = ["ios", "android", "web", "steam", "xbox", "playstation", "switch"];
        
        // Correção específica para roleta Rara e Épica
        if (wheel.Id === "lucky_spin_wheel" || wheel.Id === "Console_lucky_spin_wheel" || wheel.Id === "rare_spin_wheel") {
          wheel.Priority = 100;
          wheel.IsEnabled = true;
          wheel.Category = "OFFERS";
        }
        if (wheel.Id === "epic_spin_wheel") {
          wheel.Priority = 99;
          wheel.IsEnabled = true;
          wheel.Category = "OFFERS";
        }
      });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    Console.error("Shared", "Error sending shared:", error);
    return res.status(500).json({ error: "Error generating payload" });
  }
}

async function sendADM(req, res) {
  const admins = [1];
  const id = parseInt(req.query.id);

  if (!id) {
    return res.status(400).json("ERROR");
  }

  if (admins.includes(id)) {
    return res.status(200).json("OK");
  } else {
    return res.status(403).json("FORBIDDEN");
  }
}


async function OnlineCheck(req, res) {
  res.status(200).send("OK");
}
async function getAppId(req, res) {
  const appId = "3e8a970f-12be-41fc-b8d0-93c657234f85";
  const encryptionKey = crypto.createHash('sha256').update("Qz8gC5xK1nVZpb3AeTf6wDqMb2JLhY9R").digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
  let encrypted = cipher.update(appId, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  res.status(200).json({
    iv: iv.toString('base64'),
    content: encrypted
  });
}


module.exports = {
  Database,
  UserModel,
  UserController,
  RoundController,
  BattlePassController,
  EconomyController,
  AnalyticsController,
  FriendsController,
  NewsController,
  MissionsController,
  TournamentXController,
  MatchmakingController,
  TournamentController,
  SocialController,
  EventsController,
  CheatController,
  CreatorCodeController,
  authenticate,
  errorControll,
  sendShared,
  OnlineCheck,
  VerifyPhoton,
  generatePhotonJwt,
  getAppId,
  sendADM
};
