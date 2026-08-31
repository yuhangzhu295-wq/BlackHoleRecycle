const fs = require("fs");
let content = fs.readFileSync("assets/scripts/world/WorldChunkManager.ts", "utf8");
content = content.replace(/const cc = require\(['"].*?['"]\);/g, "");
content = content.replace(/const found = cc\.REGION_THEMES\.find/g, "const found = REGION_THEMES.find");
fs.writeFileSync("assets/scripts/world/WorldChunkManager.ts", content);
