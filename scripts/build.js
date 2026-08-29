/**
 * 自动化构建与跨端打包脚本 (WeChat & Douyin Build Tool)
 * 将 ESM 游戏源代码打包为小游戏规范的 Bundle 文件，并注入平台专属配置
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const target = process.argv[2] || 'all'; // 'wx' | 'tt' | 'web' | 'all'

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

async function buildMiniGameBundle(platformName) {
  console.log(`\n📦 正在构建 ${platformName.toUpperCase()} 小游戏工程...`);
  const outDir = path.join(rootDir, 'dist', platformName);

  // 清理并创建输出目录
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // 使用 Vite/Rollup 打包为单个 game.js 启动文件
  await build({
    root: rootDir,
    build: {
      outDir,
      emptyOutDir: false,
      minify: 'esbuild',
      lib: {
        entry: path.resolve(rootDir, 'src/main.js'),
        formats: ['iife'],
        name: 'MiniGame',
        fileName: () => 'game.js'
      },
      rollupOptions: {
        output: {
          extend: true
        }
      }
    }
  });

  // 复制对应平台的专属配置文件 (game.json, project.config.json 等)
  const platformConfigDir = path.join(rootDir, 'platform', platformName);
  if (fs.existsSync(platformConfigDir)) {
    copyFolderSync(platformConfigDir, outDir);
  }

  console.log(`✅ ${platformName.toUpperCase()} 构建成功! 产物目录: dist/${platformName}`);
}

async function buildWeb() {
  console.log(`\n📦 正在构建 Web 预览版本...`);
  await build({
    root: rootDir,
    build: {
      outDir: path.join(rootDir, 'dist/web'),
      emptyOutDir: true
    }
  });
  console.log(`✅ Web 构建成功! 产物目录: dist/web`);
}

async function run() {
  console.log(`🚀 开始执行小游戏打包任务 [Target: ${target}]...`);
  try {
    if (target === 'wx' || target === 'all') {
      await buildMiniGameBundle('wx');
    }
    if (target === 'tt' || target === 'all') {
      await buildMiniGameBundle('tt');
    }
    if (target === 'web' || target === 'all') {
      await buildWeb();
    }
    console.log('\n🎉 所有目标平台构建完成！');
  } catch (err) {
    console.error('❌ 构建失败:', err);
    process.exit(1);
  }
}

run();
