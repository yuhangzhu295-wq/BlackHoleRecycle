const fs = require("fs");
let content = fs.readFileSync("assets/scripts/gameplay/GameManager.ts", "utf8");
content = content.replace(/eventBus\.on\('UI_TRIGGER_PAUSE', \(\) => \{\n\s*console\.log\('\[GameManager\] Game paused'\);\n\s*\}\);/,
  "eventBus.on('UI_TRIGGER_PAUSE', () => {\n      const dir = require('cc').director;\n      if (dir.isPaused()) {\n        dir.resume();\n        if (this.hud) this.hud.showScreen('Gameplay');\n      } else {\n        dir.pause();\n        if (this.hud) this.hud.showScreen('Pause');\n      }\n    });");
fs.writeFileSync("assets/scripts/gameplay/GameManager.ts", content);
