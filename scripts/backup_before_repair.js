import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const rootDir = path.resolve('./cocos/assets');
const backupDir = path.resolve('./docs/backup-before-runtime-repair');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

function getSha(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const files = [
  'scenes/Game.scene',
  'scenes/Game.scene.meta',
  'scenes/Bootstrap.scene',
  'scenes/Bootstrap.scene.meta',
  'prefabs/machine/BlackHoleMachine.prefab',
  'prefabs/machine/BlackHoleMachine.prefab.meta',
  'prefabs/objects/TrashObject.prefab',
  'prefabs/objects/TrashObject.prefab.meta',
  'prefabs/chunks/BedroomChunk.prefab',
  'prefabs/chunks/BedroomChunk.prefab.meta',
  'prefabs/ui/HUD.prefab',
  'prefabs/ui/HUD.prefab.meta'
];

let doc = `# 《黑洞回收站》 Cocos 场景与预制体修复前状态审计报告 (runtime-repair-before.md)\n\n`;
doc += `审计时间: ${new Date().toISOString()}\n\n`;
doc += `## 1. 修复前文件 SHA256 与结构备份\n\n`;

for (const rel of files) {
  const src = path.join(rootDir, rel);
  if (fs.existsSync(src)) {
    const raw = fs.readFileSync(src, 'utf8');
    const sha = getSha(raw);
    doc += `### \`${rel}\`\n- **SHA256**: \`${sha}\`\n- **Size**: ${raw.length} bytes\n\n`;

    const dst = path.join(backupDir, rel.replace(/\//g, '_'));
    fs.writeFileSync(dst, raw, 'utf8');
  } else {
    doc += `### \`${rel}\`\n- **Status**: NOT_FOUND\n\n`;
  }
}

doc += `## 2. 修复前问题诊断 (Root Cause Diagnosis)
1. **Game.scene 缺失游戏节点树**: 场景仅包含 \`Main Light\` 与 \`Main Camera\`，没有任何 \`GameRoot\`、\`WorldRoot\`、\`BlackHoleMachine\` 或 \`GameManager\` 节点，导致运行时摄像机只能渲染灰色天空背景。
2. **Prefab 均为空壳节点**: \`BlackHoleMachine.prefab\`、\`TrashObject.prefab\`、\`BedroomChunk.prefab\`、\`HUD.prefab\` 序列化内容仅有空 Node，未挂载任何 \`MeshRenderer\`、几何网格（Cube/Cylinder/Sphere/Plane）、UI 元素（Label/Button）或脚本组件。
3. **GameManager Inspector 引用未序列化**: 缺乏场景内 Node 与 Component 之间的有效指针绑定，导致运行时无法驱动游戏逻辑。
`;

fs.writeFileSync(path.resolve('./docs/runtime-repair-before.md'), doc, 'utf8');
console.log('✅ Backup and before-report completed in docs/runtime-repair-before.md');
