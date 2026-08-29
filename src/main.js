/**
 * 统一游戏启动入口 (Universal MiniGame Entry Point)
 * 启动《黑洞回收站》3D WebGL 跨平台渲染引擎
 */
import { BlackHoleGame3D } from './3d/BlackHoleGame3D.js';
import { platform } from './adapter/platform.js';

function initMiniGame() {
  let container = null;
  let canvas = null;

  if (typeof document !== 'undefined') {
    container = document.getElementById('game-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'game-container';
      document.body.appendChild(container);
    }

    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'gameCanvas';
      container.appendChild(canvas);
    }
  } else if (typeof wx !== 'undefined' && wx.createCanvas) {
    canvas = wx.createCanvas();
    container = { clientWidth: platform.screenWidth, clientHeight: platform.screenHeight, appendChild: () => {} };
  } else if (typeof tt !== 'undefined' && tt.createCanvas) {
    canvas = tt.createCanvas();
    container = { clientWidth: platform.screenWidth, clientHeight: platform.screenHeight, appendChild: () => {} };
  }

  if (!canvas) {
    console.error('Canvas could not be created or located.');
    return;
  }

  // 创建 3D 黑洞回收站游戏实例
  const game = new BlackHoleGame3D(container, canvas);

  // 主循环 (60FPS WebGL Loop)
  let lastTime = Date.now();
  function loop() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    game.update(dt);
    game.render();

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(loop);
    } else {
      setTimeout(loop, 16);
    }
  }

  loop();
  console.log(`[BlackHoleRecycle] 3D Engine Initialized successfully on: ${platform.getPlatformName()}`);
}

initMiniGame();
