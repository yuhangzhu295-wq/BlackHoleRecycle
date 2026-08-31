/**
 * 极速编译并在类定义后精准注册 Cocos Creator 3.8.3 ClassID (compile-preview-chunks.mjs)
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function compressUuid(uuid) {
  if (uuid.length !== 36) return uuid;
  let zipUuid = uuid[0] + uuid[1] + uuid[2] + uuid[3] + uuid[4];
  const clean = uuid.replace(/-/g, '');
  for (let i = 5; i < 32; i += 3) {
    const hexVal = parseInt(clean.substr(i, 3), 16);
    zipUuid += BASE64_KEYS[(hexVal >> 6) & 0x3f] + BASE64_KEYS[hexVal & 0x3f];
  }
  return zipUuid;
}

const importMapPath = 'temp/programming/packer-driver/targets/preview/import-map.json';
if (!fs.existsSync(importMapPath)) {
  console.error('import-map.json not found');
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(importMapPath, 'utf8'));
const baseDir = 'temp/programming/packer-driver/targets/preview';

console.log('Compiling project scripts and registering compressed ClassIDs...');

for (const [fileUrl, chunkRelPath] of Object.entries(map.imports || {})) {
  if (!fileUrl.startsWith('file:///')) continue;
  
  let localPath = decodeURIComponent(fileUrl.replace('file:///', ''));
  if (process.platform === 'win32' && !localPath.includes(':')) {
    localPath = '/' + localPath;
  }

  if (!fs.existsSync(localPath)) {
    console.warn(`Source file not found: ${localPath}`);
    continue;
  }

  // 读取对应 .meta 文件的 UUID
  let rawUuid = '';
  let compUuid = '';
  const metaPath = localPath + '.meta';
  if (fs.existsSync(metaPath)) {
    try {
      const metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      rawUuid = metaJson.uuid || '';
      compUuid = compressUuid(rawUuid);
    } catch (e) {}
  }

  const code = fs.readFileSync(localPath, 'utf8');
  let transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.System,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
      useDefineForClassFields: true
    }
  }).outputText;

  // 将 System.register([ ... ], ...) 中的相对依赖重写为 file:/// 绝对规范 URL
  transpiled = transpiled.replace(/System\.register\(\[([\s\S]*?)\]/, (match, depsStr) => {
    const deps = depsStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const resolvedDeps = deps.map(dep => {
      if (dep === 'cc') return '"cc"';
      if (dep.startsWith('.')) {
        let abs = path.resolve(path.dirname(localPath), dep);
        if (!abs.endsWith('.ts') && !abs.endsWith('.js')) {
          if (fs.existsSync(abs + '.ts')) abs = abs + '.ts';
          else if (fs.existsSync(abs + '.js')) abs = abs + '.js';
        }
        let url = 'file:///' + abs.replace(/\\/g, '/');
        return `"${url}"`;
      }
      return `"${dep}"`;
    });
    return `System.register([${resolvedDeps.join(', ')}]`;
  });

  // 提取类名并注入 classId 注册代码在 execute 尾部
  const classNameMatches = [...code.matchAll(/export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)/g)];
  if (compUuid && classNameMatches.length > 0) {
    const mainClass = classNameMatches[0][1];
    const registerCode = `
      if (typeof cc_1 !== 'undefined' && cc_1.js) {
        if (cc_1.js._setClassId) {
          cc_1.js._setClassId('${compUuid}', ${mainClass});
          cc_1.js._setClassId('${rawUuid}', ${mainClass});
        }
        if (cc_1.js.setClassName) {
          cc_1.js.setClassName('${compUuid}', ${mainClass});
          cc_1.js.setClassName('${rawUuid}', ${mainClass});
          cc_1.js.setClassName('${mainClass}', ${mainClass});
        }
      }
    `;
    // 替换 execute 函数末尾的 closing brace
    transpiled = transpiled.replace(/execute:\s*function\s*\(\)\s*\{([\s\S]*?)\}\s*\}\s*;\s*\}\s*\);?\s*$/, (m, body) => {
      return `execute: function () {\n${body}\n${registerCode}\n        }\n    };\n});`;
    });
  }

  const destPath = path.resolve(baseDir, chunkRelPath);
  const destDir = path.dirname(destPath);
  fs.writeFileSync(destPath, transpiled);
  console.log(`[OK] ${path.basename(localPath)} (${compUuid || 'no-meta'}) -> ${chunkRelPath}`);
}

// 自动更新 prerequisite-imports 模块分块，确保浏览器预览启动时优先加载并注册所有脚本
if (map.imports && map.imports['cce:/internal/x/prerequisite-imports']) {
  const prereqChunkRel = map.imports['cce:/internal/x/prerequisite-imports'].replace(/^\.\//, '');
  const prereqDestPath = path.resolve(baseDir, prereqChunkRel);
  const allScriptUrls = Object.keys(map.imports).filter(k => k.startsWith('file:///'));
  const setters = allScriptUrls.map(() => 'function () {}').join(', ');
  const deps = allScriptUrls.map(u => JSON.stringify(u)).join(', ');
  const prereqContent = `System.register([${deps}], function (_export, _context) {\n  "use strict";\n  return {\n    setters: [${setters}],\n    execute: function () {}\n  };\n});\n`;
  fs.writeFileSync(prereqDestPath, prereqContent, 'utf8');
  console.log(`[OK] prerequisite-imports (${allScriptUrls.length} scripts) -> ${prereqChunkRel}`);
}

console.log('✅ All chunks mapped, class IDs registered, and cache written successfully!');
