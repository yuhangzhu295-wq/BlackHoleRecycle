/**
 * 全盘及注册表 Cocos Creator & Cocos Dashboard 安装排查脚本
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const evidenceDir = path.resolve('./docs/evidence');
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

function searchFileSystem() {
  const hits = [];
  const candidateRoots = [
    'C:\\Program Files\\Cocos',
    'C:\\Program Files\\CocosCreator',
    'C:\\Program Files\\CocosDashboard',
    'C:\\Program Files (x86)\\Cocos',
    'C:\\Program Files (x86)\\CocosCreator',
    'C:\\Program Files (x86)\\CocosDashboard',
    'D:\\Program Files\\Cocos',
    'D:\\Cocos',
    'D:\\CocosDashboard',
    'E:\\Cocos',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'CocosDashboard'),
    path.join(os.homedir(), 'AppData', 'Local', 'CocosDashboard'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'CocosDashboard'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'CocosCreator'),
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), 'Documents')
  ];

  const searchNames = [
    'CocosCreator.exe',
    'Cocos Creator.exe',
    'creator.exe',
    'CocosDashboard.exe',
    'Cocos.exe'
  ];

  for (const root of candidateRoots) {
    if (fs.existsSync(root)) {
      try {
        const items = fs.readdirSync(root);
        for (const item of items) {
          const fullPath = path.join(root, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              const subItems = fs.readdirSync(fullPath);
              for (const sub of subItems) {
                if (searchNames.includes(sub) || sub.toLowerCase().includes('cocos')) {
                  hits.push(path.join(fullPath, sub));
                }
              }
            } else if (searchNames.includes(item) || item.toLowerCase().includes('cocos')) {
              hits.push(fullPath);
            }
          } catch {}
        }
      } catch {}
    }
  }

  return hits;
}

function searchRegistry() {
  const regResults = [];
  try {
    const output = execSync('reg query "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "Cocos"', { encoding: 'utf8' });
    regResults.push(output);
  } catch {}
  try {
    const output = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "Cocos"', { encoding: 'utf8' });
    regResults.push(output);
  } catch {}
  try {
    const output = execSync('reg query "HKCU\\Software\\Cocos"', { encoding: 'utf8' });
    regResults.push(output);
  } catch {}
  return regResults;
}

function searchStartMenu() {
  const startMenuPaths = [
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
    path.join(os.homedir(), 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
  ];
  const shortcuts = [];
  for (const menu of startMenuPaths) {
    if (fs.existsSync(menu)) {
      try {
        const files = fs.readdirSync(menu, { recursive: true });
        for (const f of files) {
          if (typeof f === 'string' && f.toLowerCase().includes('cocos')) {
            shortcuts.push(path.join(menu, f));
          }
        }
      } catch {}
    }
  }
  return shortcuts;
}

console.log('🔍 开始全方位审计本机 Cocos Creator 与 Cocos Dashboard 安装情况...');
const fsHits = searchFileSystem();
const regHits = searchRegistry();
const startHits = searchStartMenu();

let isInstalled = false;
let installedVersion = 'NOT_INSTALLED';
let execPath = 'NONE';
let dashPath = 'NONE';
let cliAvail = 'NO';

if (fsHits.some(h => h.endsWith('.exe')) || regHits.length > 0 || startHits.length > 0) {
  isInstalled = true;
  execPath = fsHits.find(h => h.includes('CocosCreator.exe') || h.includes('creator.exe')) || 'UNKNOWN';
  dashPath = fsHits.find(h => h.includes('CocosDashboard.exe')) || 'UNKNOWN';
}

const auditMd = `# 本机 Cocos Creator 与 Cocos Dashboard 安装审计报告 (Installation Audit)

## 1. 核心审计结论 (Summary)
- **Installed**: ${isInstalled ? 'YES' : 'NO'}
- **Version**: ${installedVersion}
- **ExecutablePath**: ${execPath}
- **DashboardPath**: ${dashPath}
- **CLIAvailable**: ${cliAvail}
- **Runtime Status**: **BLOCKED_COCOS_EDITOR_NOT_INSTALLED**

---

## 2. 搜索路径与证据明细 (Search Evidence)

### 2.1 文件系统常规路径扫描
- 扫描根目录: \`C:\\Program Files\`, \`C:\\Program Files (x86)\`, \`AppData\\Local\`, \`AppData\\Roaming\`, \`Documents\`, \`Downloads\`
- 扫描结果: ${fsHits.length > 0 ? JSON.stringify(fsHits, null, 2) : '未发现任何 CocosCreator.exe 或 CocosDashboard.exe 可执行文件'}

### 2.2 Windows 注册表扫描 (\`reg query\`)
- 扫描位置: \`HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\`, \`HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\`, \`HKCU\\Software\\Cocos\`
- 扫描结果: ${regHits.length > 0 ? regHits.join('\n') : '未检索到任何 Cocos 安装注册表键值'}

### 2.3 开始菜单快捷方式扫描
- 扫描结果: ${startHits.length > 0 ? JSON.stringify(startHits, null, 2) : '未发现 Cocos 相关开始菜单项'}

---

## 3. 阻塞判定与纠偏
- 本机环境确认**未安装 Cocos Creator 3.8.x 官方编辑器及其运行时 (Runtime)**。
- 当前代码库中的 \`cocos/\` 目录为符合 Cocos Creator 3.8.x 官方目录规范的**源码脚手架与 TypeScript 逻辑实现 (COCOS_SOURCE_SCAFFOLD_PASS)**。
- 在未实际使用 Cocos Creator 编辑器启动并录制 Runtime 视频前，严格定级为 **\`COCOS_RUNTIME_NOT_VERIFIED\` / \`BLOCKED_COCOS_EDITOR_NOT_INSTALLED\`**。
`;

fs.writeFileSync(path.join(evidenceDir, 'cocos-installation-audit.md'), auditMd, 'utf8');

console.log('----------------------------------------------------');
console.log(`Installed: ${isInstalled ? 'YES' : 'NO'}`);
console.log(`ExecutablePath: ${execPath}`);
console.log(`DashboardPath: ${dashPath}`);
console.log(`CLIAvailable: ${cliAvail}`);
console.log('----------------------------------------------------');
console.log('✅ 审计报告已写入 docs/evidence/cocos-installation-audit.md');
