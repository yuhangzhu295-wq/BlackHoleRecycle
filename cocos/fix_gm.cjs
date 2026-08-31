const fs = require("fs");
let content = fs.readFileSync("assets/scripts/gameplay/GameManager.ts", "utf8");

content = content.replace(/import \{ HUDView \} from '\.\.\/ui\/HUDView';/, 
  "import { HUDView } from '../ui/HUDView';\nimport { CompressionSystem } from './CompressionSystem';");

content = content.replace(/public currentCoins: number = 0;/, 
  "public currentCoins: number = 0;\n  public compressionSystem: CompressionSystem | null = null;");

content = content.replace(/if \(\!this\.chunkManager\) \{/, 
  "if (!this.compressionSystem) {\n      this.compressionSystem = this.node.getComponent(CompressionSystem) || this.node.addComponent(CompressionSystem);\n    }\n    if (!this.chunkManager) {");

const newAbsorbed = `  public onObjectAbsorbed(obj: CompressibleObject): void {
    if (!this.machine) return;

    const t = obj.template;
    this.totalAbsorbedCount++;
    this.score += t.value * 10;

    // Use actual Compression System instead of fake setTimeout
    if (this.compressionSystem) {
      this.compressionSystem.absorbObject(obj, this.machine);
    }
  }`;
content = content.replace(/  public onObjectAbsorbed\(obj: CompressibleObject\): void \{[\s\S]*?analyticsService\.track\('object_absorb'[\s\S]*?\}\n  \}/s, newAbsorbed);

content = content.replace(/eventBus\.on\('UI_TRIGGER_PAUSE', \(\) => \{/,
  "eventBus.on('UI_UPDATE_HUD', (data: any) => {\n      this.currentCoins = data.coins;\n      this.updateHUD();\n    });\n    eventBus.on('UI_TRIGGER_PAUSE', () => {");

fs.writeFileSync("assets/scripts/gameplay/GameManager.ts", content);
