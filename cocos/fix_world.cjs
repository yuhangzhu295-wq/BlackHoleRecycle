const fs = require("fs");
let content = fs.readFileSync("assets/scripts/world/WorldChunkManager.ts", "utf8");

// Change CHUNK_LENGTH
content = content.replace(/public static readonly CHUNK_LENGTH = 40\.0;/, "public static readonly CHUNK_LENGTH = 50.0;");

// Update buildVisibleEnvironment width to 36m (18m left and right)
content = content.replace(/MeshFactory\.getBoxMesh\(24\.0,/g, "MeshFactory.getBoxMesh(36.0,");
content = content.replace(/wallL\.setPosition\(-12\.0,/g, "wallL.setPosition(-18.0,");
content = content.replace(/wallR\.setPosition\(12\.0,/g, "wallR.setPosition(18.0,");

// Update Region Sequence
const regionUpdateFunc = `  public updateChunks(playerZ: number): void {
    if (this.activeChunks.length === 0) return;

    // Check forward spawn
    const forwardMostChunk = this.activeChunks[this.activeChunks.length - 1];
    if (playerZ < forwardMostChunk.centerZ + WorldChunkManager.CHUNK_LENGTH * 0.5) {
      this.spawnNextChunk();
    }

    // Update Region logic based on nextChunkIndex
    const regionThemes = [
      { maxIndex: 4, themeId: 'bedroom' },
      { maxIndex: 9, themeId: 'warehouse' },
      { maxIndex: 9999, themeId: 'supermarket' }
    ];
    let nextThemeId = 'bedroom';
    for (const rt of regionThemes) {
      if (this.nextChunkIndex <= rt.maxIndex) {
        nextThemeId = rt.themeId;
        break;
      }
    }
    
    // Find theme from GameConfig based on nextThemeId (assume imported REGION_THEMES or similar, wait, currentTheme is assigned)
    if (this.currentTheme.id !== nextThemeId) {
       // Just find it in REGION_THEMES
       const cc = require('../data/GameConfig');
       const found = cc.REGION_THEMES.find(t => t.id === nextThemeId);
       if (found) this.currentTheme = found;
    }

    // Check backward recycle
    if (this.activeChunks.length > WorldChunkManager.ACTIVE_CHUNK_COUNT) {
      const oldestChunk = this.activeChunks[0];
      if (playerZ < oldestChunk.centerZ - WorldChunkManager.CHUNK_LENGTH * 1.5) {
        if (this.objectPool) {
          oldestChunk.clear(this.objectPool);
        }
        oldestChunk.chunkNode.destroy();
        this.activeChunks.shift();
      }
    }
  }`;

content = content.replace(/  public updateChunks\(playerZ: number\): void \{[\s\S]*?    \}\n  \}/s, regionUpdateFunc);

fs.writeFileSync("assets/scripts/world/WorldChunkManager.ts", content);
