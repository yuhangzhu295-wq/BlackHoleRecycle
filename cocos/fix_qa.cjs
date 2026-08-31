const fs = require("fs");
let content = fs.readFileSync("assets/scripts/gameplay/GameManager.ts", "utf8");

// Remove old QA_MODE
content = content.replace(/\/\/ Inject QA_MODE[\s\S]*?\}\);/, "");

// Inject new strict read-only QA bridge inside initWorld or onLoad
const newQABridge = `    // Inject STRICT READ-ONLY QA_MODE
    (window as any).__BHR_QA__ = {
      snapshot: () => {
        return {
          scene: require('cc').director.getScene()?.name,
          gameState: this.isPaused ? 'PAUSED' : 'PLAYING',
          machineMass: this.machine?.currentMass || 0,
          machineLevel: this.machine?.currentLevel || 1,
          player: {
            x: this.machine?.node.position.x,
            y: this.machine?.node.position.y,
            z: this.machine?.node.position.z,
          },
          compression: {
            state: this.compressionSystem?.state,
            bufferMass: this.compressionSystem?.bufferMass,
            bufferCount: this.compressionSystem?.bufferCount,
            resourceBlockCount: this.compressionSystem?.resourceBlockCount,
            storedResources: this.compressionSystem?.storedResources
          },
          world: {
            currentRegion: this.chunkManager?.currentTheme.id,
            activeAreaCount: this.chunkManager?.activeChunks.length
          },
          session: {
            absorbed: this.totalAbsorbedCount,
            coinsEarned: this.currentCoins,
            score: this.score
          },
          save: {
            coins: require('../data/SaveService').saveService.data.coins
          }
        };
      }
    };`;

content = content.replace(/this\.initWorld\(\);/, "this.initWorld();\n" + newQABridge);

fs.writeFileSync("assets/scripts/gameplay/GameManager.ts", content);
