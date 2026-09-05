/**
 * 《黑洞回收站》全套 UI 视图交互管理器 (UIManager)
 * 精准实现 15 页设计图全套页面与交互：
 * 01. 启动页 | 02. 首页 | 03. 模式选择 | 04. 新手引导 | 05/06. 游戏 HUD | 07. 升级三选一 |
 * 08. 压缩回收 | 09. 技能状态 | 10. 区域解锁 | 11. 车库进化 | 12. 皮肤装扮 | 13. 任务系统 |
 * 14. 结算页 | 15. 商店页 | 设置与暂停弹窗
 */
import { saveManager } from '../data/SaveManager.js';
import { MACHINE_EVOLUTION_CONFIG, REGION_THEMES, SKINS_CONFIG, SHOP_ITEMS_CONFIG, ROGUELIKE_PERKS, DAILY_TASKS_CONFIG } from '../data/GameConfig.js';
import { audio } from '../engine/audio.js';
import { adService } from '../monetization/AdService.js';
import { analytics } from '../analytics/AnalyticsService.js';
import { platform } from '../adapter/platform.js';
import { eventBus } from '../core/EventBus.js';

export class UIManager {
  constructor(container, game) {
    this.container = container;
    this.game = game;
    this.currentView = 'START'; // 'START' | 'HOME' | 'GAMEPLAY' | 'GARAGE' | 'SKINS' | 'TASKS' | 'SHOP'
    this.overlayContainer = null;
    this.hudContainer = null;
    this.modalContainer = null;
    this.tutorialStep = 1;
    this.upgradeChoices = [];
    this.remainingRefreshes = 2;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    // 注入统一全局 UI 样式表
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .ui-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #ffffff;
        overflow: hidden;
      }
      .ui-layer * {
        box-sizing: border-box;
      }
      .ui-interactive {
        pointer-events: auto;
      }
      .btn-primary {
        background: linear-gradient(180deg, #ffcc00 0%, #ff9500 100%);
        border: 2px solid #fff;
        box-shadow: 0 4px 12px rgba(255, 149, 0, 0.45);
        color: #1a1a1a;
        font-weight: 800;
        border-radius: 28px;
        cursor: pointer;
        transition: transform 0.1s, filter 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        text-shadow: 0 1px 1px rgba(255, 255, 255, 0.4);
      }
      .btn-primary:active {
        transform: scale(0.94);
        filter: brightness(0.9);
      }
      .btn-secondary {
        background: rgba(35, 45, 60, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 20px;
        color: #ffffff;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(8px);
        transition: transform 0.1s;
      }
      .btn-secondary:active {
        transform: scale(0.95);
      }
      .panel-glass {
        background: rgba(18, 24, 38, 0.92);
        border: 1.5px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(12px);
      }
      .pill-badge {
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        padding: 4px 12px;
        font-size: 13px;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .skill-circle-btn {
        width: 58px;
        height: 58px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%);
        border: 2px solid #38bdf8;
        box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        pointer-events: auto;
        transition: transform 0.1s;
      }
      .skill-circle-btn:active {
        transform: scale(0.9);
      }
      .skill-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 20px;
        height: 20px;
        background: #e11d48;
        border: 1.5px solid #fff;
        border-radius: 50%;
        color: #fff;
        font-size: 11px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .banner-anim {
        animation: popDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes popDown {
        0% { transform: translate(-50%, -40px) scale(0.85); opacity: 0; }
        100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(styleEl);

    // 主视图容器
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'ui-overlay-container';
    this.overlayContainer.className = 'ui-layer ui-interactive';
    this.container.appendChild(this.overlayContainer);

    // 游戏内 HUD 容器
    this.hudContainer = document.createElement('div');
    this.hudContainer.id = 'ui-hud-container';
    this.hudContainer.className = 'ui-layer';
    this.hudContainer.style.display = 'none';
    this.container.appendChild(this.hudContainer);

    // 模态弹窗顶层容器
    this.modalContainer = document.createElement('div');
    this.modalContainer.id = 'ui-modal-container';
    this.modalContainer.className = 'ui-layer ui-interactive';
    this.modalContainer.style.display = 'none';
    this.container.appendChild(this.modalContainer);

    this.showStartupView();
  }

  bindEvents() {
    eventBus.on('MACHINE_EVOLVED', ({ level, config }) => {
      audio.playEvolution();
      platform.vibrate('heavy');
      this.showEvolutionBanner(level, config);
    });

    eventBus.on('REGION_CHANGED', ({ theme }) => {
      audio.playUnlock();
      platform.vibrate('medium');
      this.showRegionUnlockModal(theme);
    });

    eventBus.on('TRIGGER_ROGUELIKE_UPGRADE', () => {
      this.showRoguelikeUpgradeModal();
    });

    eventBus.on('TRIGGER_COMPRESSION_EVENT', (data) => {
      this.showCompressionModal(data);
    });
  }

  // ==========================================
  // 01. 启动页 (Startup Screen)
  // ==========================================
  showStartupView() {
    this.currentView = 'START';
    this.hudContainer.style.display = 'none';
    this.modalContainer.style.display = 'none';
    this.overlayContainer.style.display = 'block';

    const coins = saveManager.data.coins;
    this.overlayContainer.innerHTML = `
      <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; align-items:center; padding: 24px 18px 36px 18px; background: radial-gradient(circle at 50% 30%, rgba(30,41,59,0.7) 0%, rgba(10,15,25,0.95) 100%);">
        <!-- 顶栏状态与设置 -->
        <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
          <div class="pill-badge">🪙 <span>${coins}</span></div>
          <div id="btnStartSettings" class="btn-secondary" style="width:38px; height:38px; border-radius:50%; font-size:18px;">⚙️</div>
        </div>

        <!-- 3D 主视觉 Logo 标题 -->
        <div style="display:flex; flex-direction:column; align-items:center; text-align:center; margin-top:20px;">
          <div style="font-size: 48px; font-weight: 900; letter-spacing: 2px; color: #ffeb3b; text-shadow: 0 4px 18px rgba(255, 235, 59, 0.6), 0 0 30px rgba(0,229,255,0.5); transform: rotate(-2deg);">
            压个痛快
          </div>
          <div style="font-size: 16px; font-weight: 800; color: #00e5ff; letter-spacing: 6px; margin-top: 4px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">
            《黑洞回收站》
          </div>
          <div style="background: rgba(0,0,0,0.6); padding: 4px 16px; border-radius: 12px; font-size: 13px; color: #94a3b8; margin-top: 10px; border: 1px solid rgba(255,255,255,0.15);">
            吸走一切，压个痛快！
          </div>
        </div>

        <!-- 底部大黄色主按钮与快捷入口 -->
        <div style="width:100%; max-width:320px; display:flex; flex-direction:column; gap:16px; align-items:center;">
          <button id="btnMainStart" class="btn-primary" style="width:100%; height:58px; font-size:22px;">
            开始游戏
          </button>

          <div style="width:100%; display:flex; justify-content:space-around; align-items:center; background:rgba(15,23,42,0.8); padding:10px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.12);">
            <div id="navTasks" style="display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer;">
              <span style="font-size:22px;">📋</span>
              <span style="font-size:12px; color:#cbd5e1; font-weight:600;">任务</span>
            </div>
            <div id="navSkins" style="display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer;">
              <span style="font-size:22px;">🎨</span>
              <span style="font-size:12px; color:#cbd5e1; font-weight:600;">皮肤</span>
            </div>
            <div id="navShop" style="display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer;">
              <span style="font-size:22px;">🛒</span>
              <span style="font-size:12px; color:#cbd5e1; font-weight:600;">商店</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnStartSettings').onclick = () => { audio.playClick(); this.showSettingsModal(); };
    document.getElementById('btnMainStart').onclick = () => { audio.playClick(); this.showModeSelectModal(); };
    document.getElementById('navTasks').onclick = () => { audio.playClick(); this.showTasksModal(); };
    document.getElementById('navSkins').onclick = () => { audio.playClick(); this.showSkinsModal(); };
    document.getElementById('navShop').onclick = () => { audio.playClick(); this.showShopModal(); };
  }

  // ==========================================
  // 02. 首页 (Home Screen)
  // ==========================================
  showHomeView() {
    this.currentView = 'HOME';
    this.hudContainer.style.display = 'none';
    this.modalContainer.style.display = 'none';
    this.overlayContainer.style.display = 'block';

    const coins = saveManager.data.coins;
    const highScore = saveManager.data.highScore;

    this.overlayContainer.innerHTML = `
      <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; align-items:center; padding: 20px 16px 20px 16px; background: linear-gradient(180deg, rgba(15,23,42,0.85) 0%, rgba(10,15,25,0.4) 50%, rgba(15,23,42,0.9) 100%);">
        <!-- 顶栏状态 -->
        <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
          <div class="pill-badge" style="font-size:14px; background:rgba(0,0,0,0.6);">🪙 <span id="homeCoinText">${coins}</span></div>
          <div style="font-size:14px; font-weight:bold; color:#38bdf8; background:rgba(0,0,0,0.6); padding:4px 12px; border-radius:14px; border:1px solid rgba(56,189,248,0.3);">
            最高分: ${highScore.toLocaleString()}
          </div>
          <div id="btnHomeSettings" class="btn-secondary" style="width:36px; height:36px; border-radius:50%; font-size:16px;">⚙️</div>
        </div>

        <!-- 中部功能快捷挂件 -->
        <div style="width:100%; display:flex; justify-content:flex-end; padding-right:8px;">
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div id="homeShortcutTasks" class="btn-secondary" style="width:46px; height:46px; border-radius:14px; flex-direction:column; font-size:18px;">
              📋<span style="font-size:9px;">任务</span>
            </div>
            <div id="homeShortcutSkins" class="btn-secondary" style="width:46px; height:46px; border-radius:14px; flex-direction:column; font-size:18px;">
              🎨<span style="font-size:9px;">皮肤</span>
            </div>
            <div id="homeShortcutShop" class="btn-secondary" style="width:46px; height:46px; border-radius:14px; flex-direction:column; font-size:18px;">
              🛒<span style="font-size:9px;">商店</span>
            </div>
          </div>
        </div>

        <!-- 底部操作与导航栏 -->
        <div style="width:100%; max-width:360px; display:flex; flex-direction:column; gap:12px; align-items:center;">
          <div style="width:100%; display:flex; gap:10px;">
            <button id="btnHomeStartGame" class="btn-primary" style="flex:2; height:54px; font-size:20px;">
              开始游戏 ⚡x5
            </button>
            <button id="btnHomeChallenge" class="btn-secondary" style="flex:1; height:54px; font-size:15px; background:rgba(56,189,248,0.25); border-color:#38bdf8;">
              挑战模式
            </button>
          </div>

          <!-- 底部 4 Tab 导航 -->
          <div style="width:100%; display:flex; justify-content:space-around; align-items:center; background:rgba(15,23,42,0.95); padding:8px 6px; border-radius:24px; border:1px solid rgba(255,255,255,0.15);">
            <div id="tabHome" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; color:#ffcc00;">
              <span style="font-size:20px;">🏠</span>
              <span style="font-size:11px; font-weight:bold;">首页</span>
            </div>
            <div id="tabUpgrade" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; color:#94a3b8;">
              <span style="font-size:20px;">⬆️</span>
              <span style="font-size:11px; font-weight:bold;">升级</span>
            </div>
            <div id="tabGarage" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; color:#94a3b8;">
              <span style="font-size:20px;">🚗</span>
              <span style="font-size:11px; font-weight:bold;">车库</span>
            </div>
            <div id="tabAchievements" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; color:#94a3b8;">
              <span style="font-size:20px;">🏆</span>
              <span style="font-size:11px; font-weight:bold;">成就</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnHomeSettings').onclick = () => { audio.playClick(); this.showSettingsModal(); };
    document.getElementById('btnHomeStartGame').onclick = () => { audio.playClick(); this.showModeSelectModal(); };
    document.getElementById('btnHomeChallenge').onclick = () => { audio.playClick(); this.startPlayMode('CHALLENGE'); };
    document.getElementById('homeShortcutTasks').onclick = () => { audio.playClick(); this.showTasksModal(); };
    document.getElementById('homeShortcutSkins').onclick = () => { audio.playClick(); this.showSkinsModal(); };
    document.getElementById('homeShortcutShop').onclick = () => { audio.playClick(); this.showShopModal(); };
    document.getElementById('tabUpgrade').onclick = () => { audio.playClick(); this.showMetaUpgradeModal(); };
    document.getElementById('tabGarage').onclick = () => { audio.playClick(); this.showGarageModal(); };
    document.getElementById('tabAchievements').onclick = () => { audio.playClick(); this.showTasksModal(); };
  }

  // ==========================================
  // 03. 模式选择 (Mode Select Modal)
  // ==========================================
  showModeSelectModal() {
    this.modalContainer.style.display = 'block';
    const coins = saveManager.data.coins;

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:360px; padding:24px 20px; display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="pill-badge">🪙 ${coins}</div>
            <div style="font-size:20px; font-weight:800; color:#fff;">选择模式</div>
            <div id="btnCloseMode" style="font-size:20px; cursor:pointer; color:#94a3b8; width:30px; height:30px; display:flex; align-items:center; justify-content:center;">✕</div>
          </div>

          <!-- 无尽模式卡片 -->
          <div id="cardEndless" style="background:linear-gradient(135deg, #15803d 0%, #166534 100%); border:2px solid #4ade80; border-radius:18px; padding:16px; cursor:pointer; display:flex; flex-direction:column; gap:8px; box-shadow:0 6px 20px rgba(34,197,94,0.3); transition:transform 0.1s;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:20px; font-weight:900; color:#fff;">无尽模式</span>
              <span style="font-size:22px;">🌌 ➔</span>
            </div>
            <div style="font-size:12px; color:#dcfce7; line-height:1.4;">
              场景不断切换，持续吸附回收；适合放松解压，不断挑战更高分数！
            </div>
          </div>

          <!-- 挑战模式卡片 -->
          <div id="cardChallenge" style="background:linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); border:2px solid #60a5fa; border-radius:18px; padding:16px; cursor:pointer; display:flex; flex-direction:column; gap:8px; box-shadow:0 6px 20px rgba(59,130,246,0.3); transition:transform 0.1s;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:20px; font-weight:900; color:#fff;">挑战模式</span>
              <span style="font-size:22px;">🎯 ➔</span>
            </div>
            <div style="font-size:12px; color:#dbeafe; line-height:1.4;">
              60秒限时目标、指定回收任务；完成目标赢取海量金币奖励！
            </div>
          </div>

          <div style="background:rgba(255,255,255,0.06); padding:10px 12px; border-radius:12px; font-size:11px; color:#94a3b8; text-align:center;">
            💡 小贴士：完成任务和挑战可获得金币，用于强化吸附能力与解锁新机型！
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseMode').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
    };
    document.getElementById('cardEndless').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
      this.startPlayMode('ENDLESS');
    };
    document.getElementById('cardChallenge').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
      this.startPlayMode('CHALLENGE');
    };
  }

  // ==========================================
  // 04. 新手引导 (Beginner Guide Overlay)
  // ==========================================
  showTutorialOverlay(onComplete) {
    this.modalContainer.style.display = 'block';
    this.tutorialStep = 1;

    const steps = [
      {
        title: '拖动屏幕移动',
        desc: '手指在屏幕任意位置滑动，黑洞吸尘机会灵敏跟随！',
        icon: '👆',
        badge: '1/4'
      },
      {
        title: '靠近物体自动吸附',
        desc: '靠近散落的杂物，强大的引力会将它们自动卷入黑洞！',
        icon: '🧲',
        badge: '2/4'
      },
      {
        title: '机器自动进化',
        desc: '累积足够质量后机器会自动变形进化，吸力范围与吸附能力暴增！',
        icon: '✨',
        badge: '3/4'
      },
      {
        title: '压缩回收变现金币',
        desc: '吸附垃圾会装车压缩为高能资源块，立即转化为金币收益！',
        icon: '📦',
        badge: '4/4'
      }
    ];

    const renderStep = () => {
      const cur = steps[this.tutorialStep - 1];
      this.modalContainer.innerHTML = `
        <div style="width:100%; height:100%; background:rgba(0,0,0,0.65); display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px;">
          <div class="panel-glass banner-anim" style="width:100%; max-width:320px; padding:24px 20px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:14px;">
            <div style="font-size:48px;">${cur.icon}</div>
            <div style="font-size:20px; font-weight:800; color:#38bdf8;">${cur.title}</div>
            <div style="font-size:13px; color:#cbd5e1; line-height:1.5;">${cur.desc}</div>
            <div style="background:rgba(0,0,0,0.5); padding:4px 16px; border-radius:12px; font-size:12px; color:#94a3b8;">${cur.badge}</div>
            <button id="btnNextTutorial" class="btn-primary" style="width:100%; height:44px; font-size:16px; margin-top:8px;">
              ${this.tutorialStep === 4 ? '立即体验！' : '下一步'}
            </button>
          </div>
        </div>
      `;

      document.getElementById('btnNextTutorial').onclick = () => {
        audio.playClick();
        if (this.tutorialStep < 4) {
          this.tutorialStep++;
          renderStep();
        } else {
          saveManager.data.tutorialCompleted = true;
          saveManager.save();
          this.modalContainer.style.display = 'none';
          if (onComplete) onComplete();
        }
      };
    };

    renderStep();
  }

  // ==========================================
  // 05 & 06. 游戏 HUD (Gameplay Screen)
  // ==========================================
  startPlayMode(mode = 'ENDLESS') {
    this.currentView = 'GAMEPLAY';
    this.overlayContainer.style.display = 'none';
    this.modalContainer.style.display = 'none';
    this.hudContainer.style.display = 'block';

    analytics.track(mode === 'ENDLESS' ? 'endless_start' : 'challenge_start', { mode });

    // 首次游戏触发引导
    if (!saveManager.data.tutorialCompleted) {
      this.showTutorialOverlay(() => {
        this.game.start(mode);
      });
    } else {
      this.game.start(mode);
    }

    this.renderGameplayHUD();
  }

  renderGameplayHUD() {
    this.hudContainer.innerHTML = `
      <!-- 顶栏 HUD (清理进度、时间、金币、暂停) -->
      <div style="position:absolute; top:16px; left:16px; right:16px; display:flex; justify-content:space-between; align-items:center; z-index:10;">
        <div id="btnHudPause" class="btn-secondary ui-interactive" style="width:40px; height:40px; border-radius:50%; font-size:18px;">⏸️</div>
        
        <!-- 清理进度条 -->
        <div style="display:flex; flex-direction:column; align-items:center; flex:1; max-width:180px; margin:0 12px;">
          <div style="font-size:11px; font-weight:800; color:#38bdf8; letter-spacing:1px; margin-bottom:2px;">
            清理进度 <span id="hudProgressText">0%</span>
          </div>
          <div style="width:100%; height:12px; background:rgba(0,0,0,0.6); border:1.5px solid rgba(255,255,255,0.25); border-radius:8px; overflow:hidden;">
            <div id="hudProgressBar" style="width:0%; height:100%; background:linear-gradient(90deg, #22c55e 0%, #4ade80 100%); transition:width 0.2s;"></div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
          <div class="pill-badge" style="font-size:13px;">🪙 <span id="hudCoinsText">0</span></div>
          <div id="hudTimerText" style="font-size:11px; color:#94a3b8; font-weight:bold;">00:00</div>
        </div>
      </div>

      <!-- 左侧动态连击浮动面板 -->
      <div id="hudComboPanel" style="position:absolute; top:80px; left:16px; display:none; flex-direction:column; z-index:10;">
        <div id="hudComboText" style="font-size:24px; font-weight:900; font-style:italic; color:#fbbf24; text-shadow:0 2px 10px rgba(251,191,36,0.6);">
          x12 连击!
        </div>
        <div id="hudComboSub" style="font-size:12px; color:#38bdf8; font-weight:bold;">+156 分数</div>
      </div>

      <!-- 右侧 3 大技能按钮 -->
      <div style="position:absolute; right:16px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:16px; z-index:10;">
        <div id="btnSkillMagnet" class="skill-circle-btn" title="磁暴模式">
          <div class="skill-badge" id="badgeMagnet">2</div>
          <span style="font-size:20px;">🧲</span>
          <span style="font-size:9px; color:#38bdf8; font-weight:bold; margin-top:2px;">磁暴</span>
        </div>
        <div id="btnSkillSpeed" class="skill-circle-btn" style="border-color:#fbbf24;" title="疾速推进">
          <div class="skill-badge" style="background:#f59e0b;" id="badgeSpeed">1</div>
          <span style="font-size:20px;">⚡</span>
          <span style="font-size:9px; color:#fbbf24; font-weight:bold; margin-top:2px;">加速</span>
        </div>
        <div id="btnSkillCompress" class="skill-circle-btn" style="border-color:#4ade80;" title="即时压缩">
          <div class="skill-badge" style="background:#16a34a;" id="badgeCompress">3</div>
          <span style="font-size:20px;">📦</span>
          <span style="font-size:9px; color:#4ade80; font-weight:bold; margin-top:2px;">压缩</span>
        </div>
      </div>

      <!-- 底部虚拟摇杆提示 -->
      <div id="hudJoystickAura" style="position:absolute; bottom:28px; left:50%; transform:translateX(-50%); width:120px; height:120px; border-radius:50%; border:2px dashed rgba(255,255,255,0.25); background:rgba(0,0,0,0.15); display:flex; align-items:center; justify-content:center; pointer-events:none;">
        <div id="hudJoystickThumb" style="width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,0.4); border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>
      </div>

      <!-- 动态事件悬浮横幅 (进化/锁标) -->
      <div id="hudCenterBanner" class="panel-glass banner-anim" style="position:absolute; top:120px; left:50%; transform:translateX(-50%); padding:8px 20px; display:none; align-items:center; gap:8px; z-index:20; border-color:#38bdf8;">
        <span id="hudBannerIcon" style="font-size:22px;">🎉</span>
        <span id="hudBannerText" style="font-size:15px; font-weight:bold; color:#fff;">机器已进化！</span>
      </div>
    `;

    document.getElementById('btnHudPause').onclick = () => { audio.playClick(); this.showPauseModal(); };
    document.getElementById('btnSkillMagnet').onclick = () => { this.game.triggerSkill('MAGNET'); };
    document.getElementById('btnSkillSpeed').onclick = () => { this.game.triggerSkill('SPEED'); };
    document.getElementById('btnSkillCompress').onclick = () => { this.game.triggerSkill('COMPRESS'); };
  }

  updateHUD(data) {
    if (this.currentView !== 'GAMEPLAY') return;

    const progressEl = document.getElementById('hudProgressBar');
    const progressText = document.getElementById('hudProgressText');
    const coinsText = document.getElementById('hudCoinsText');
    const timerText = document.getElementById('hudTimerText');
    const comboPanel = document.getElementById('hudComboPanel');
    const comboText = document.getElementById('hudComboText');
    const comboSub = document.getElementById('hudComboSub');

    if (progressEl && data.cleanProgress !== undefined) {
      const pct = Math.min(100, Math.round(data.cleanProgress));
      progressEl.style.width = `${pct}%`;
      if (progressText) progressText.innerText = `${pct}%`;
    }

    if (coinsText && data.coins !== undefined) {
      coinsText.innerText = data.coins;
    }

    if (timerText && data.timeElapsed !== undefined) {
      const mins = Math.floor(data.timeElapsed / 60).toString().padStart(2, '0');
      const secs = Math.floor(data.timeElapsed % 60).toString().padStart(2, '0');
      timerText.innerText = `${mins}:${secs}`;
    }

    if (comboPanel && comboText) {
      if (data.combo && data.combo > 1) {
        comboPanel.style.display = 'flex';
        comboText.innerText = `x${data.combo} 连击!`;
        if (comboSub) comboSub.innerText = `+${data.comboScore || data.combo * 15} 积分`;
      } else {
        comboPanel.style.display = 'none';
      }
    }
  }

  showEvolutionBanner(level, config) {
    const banner = document.getElementById('hudCenterBanner');
    const icon = document.getElementById('hudBannerIcon');
    const text = document.getElementById('hudBannerText');
    if (banner && text) {
      icon.innerText = '⚡';
      text.innerText = `🎉 机器进化！LV.${level} ${config.title}`;
      banner.style.display = 'flex';
      setTimeout(() => {
        banner.style.display = 'none';
      }, 2000);
    }
  }

  // ==========================================
  // 07. 升级选择 (Upgrade Select - Roguelike 3-Choice)
  // ==========================================
  showRoguelikeUpgradeModal() {
    this.modalContainer.style.display = 'block';
    this.remainingRefreshes = 2;

    // 随机抽选 3 个不同词条
    const shuffled = [...ROGUELIKE_PERKS].sort(() => 0.5 - Math.random());
    this.upgradeChoices = shuffled.slice(0, 3);

    analytics.track('upgrade_offer', { choices: this.upgradeChoices.map(c => c.id) });

    const renderCards = () => {
      let cardsHtml = '';
      this.upgradeChoices.forEach((perk, idx) => {
        const stars = '⭐️'.repeat(perk.stars);
        cardsHtml += `
          <div class="perk-card" data-idx="${idx}" style="background:rgba(30,41,59,0.9); border:2px solid #38bdf8; border-radius:16px; padding:14px; cursor:pointer; display:flex; flex-direction:column; gap:6px; box-shadow:0 4px 14px rgba(56,189,248,0.25); transition:transform 0.1s;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:24px;">${perk.icon}</span>
              <span style="font-size:12px;">${stars}</span>
            </div>
            <div style="font-size:17px; font-weight:800; color:#fff;">${perk.name}</div>
            <div style="font-size:12px; color:#94a3b8;">${perk.desc}</div>
          </div>
        `;
      });

      this.modalContainer.innerHTML = `
        <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
          <div class="panel-glass banner-anim" style="width:100%; max-width:340px; padding:22px 18px; display:flex; flex-direction:column; gap:14px;">
            <div style="text-align:center;">
              <div style="font-size:22px; font-weight:900; color:#ffcc00; letter-spacing:1px;">升级选择</div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">请选择一项强化你的回收能力</div>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
              ${cardsHtml}
            </div>

            <button id="btnRefreshUpgrade" class="btn-secondary" style="width:100%; height:42px; font-size:14px; border-color:#ffcc00; color:#ffcc00;">
              🔄 刷新选项 (剩余 ${this.remainingRefreshes} 次)
            </button>
          </div>
        </div>
      `;

      // 绑定卡片点击
      const cardEls = this.modalContainer.querySelectorAll('.perk-card');
      cardEls.forEach(el => {
        el.onclick = () => {
          const idx = parseInt(el.getAttribute('data-idx'));
          const chosen = this.upgradeChoices[idx];
          audio.playPowerup();
          chosen.apply(this.game.machine);
          analytics.track('upgrade_selected', { perkId: chosen.id });
          this.modalContainer.style.display = 'none';
          this.game.resume();
        };
      });

      document.getElementById('btnRefreshUpgrade').onclick = () => {
        if (this.remainingRefreshes > 0) {
          audio.playClick();
          this.remainingRefreshes--;
          const newShuffled = [...ROGUELIKE_PERKS].sort(() => 0.5 - Math.random());
          this.upgradeChoices = newShuffled.slice(0, 3);
          analytics.track('upgrade_refresh', { remaining: this.remainingRefreshes });
          renderCards();
        } else {
          // 广告刷新
          adService.showRewardedAd('UPGRADE_REFRESH', () => {
            this.remainingRefreshes = 1;
            renderCards();
          });
        }
      };
    };

    renderCards();
  }

  // ==========================================
  // 08. 压缩回收弹窗 (Compression Modal)
  // ==========================================
  showCompressionModal({ mass = 500, coins = 256 }) {
    this.modalContainer.style.display = 'block';
    audio.playCompress();
    platform.vibrate('medium');

    saveManager.addCoins(coins);
    saveManager.recordTaskProgress('compressTimes', 1);

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:340px; padding:22px 18px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px;">
          <div style="font-size:18px; font-weight:800; color:#38bdf8;">压缩中... 100%</div>
          <div style="font-size:52px; margin:4px 0;">🚚</div>
          <div style="font-size:24px; font-weight:900; color:#ffcc00; text-shadow:0 2px 10px rgba(255,204,0,0.5);">
            🪙 +${coins}
          </div>
          <div style="font-size:13px; color:#cbd5e1;">压缩完成，废弃杂物已装车运往仓库！</div>

          <!-- 资源块清单 -->
          <div style="width:100%; display:flex; justify-content:space-around; background:rgba(0,0,0,0.4); padding:10px; border-radius:14px; margin:4px 0;">
            <div style="font-size:11px; color:#94a3b8;">📦 纸箱 x18</div>
            <div style="font-size:11px; color:#94a3b8;">🔩 零件 x12</div>
            <div style="font-size:11px; color:#94a3b8;">🔋 电池 x8</div>
          </div>

          <button id="btnContinueCleaning" class="btn-primary" style="width:100%; height:46px; font-size:16px; margin-top:4px;">
            继续清理
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnContinueCleaning').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
      this.game.resume();
    };
  }

  // ==========================================
  // 10. 区域解锁 / 切换 (Region Unlock Modal)
  // ==========================================
  showRegionUnlockModal(theme) {
    this.modalContainer.style.display = 'block';
    audio.playUnlock();

    saveManager.recordTaskProgress('reachedRegionWarehouse', 1);
    analytics.track('region_enter', { theme: theme.name });

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:340px; padding:24px 18px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:14px;">
          <div style="font-size:24px; font-weight:900; color:#ffcc00; letter-spacing:2px;">区域解锁！</div>
          <div style="background:linear-gradient(90deg, #f59e0b, #d97706); color:#fff; font-weight:900; font-size:22px; padding:8px 32px; border-radius:18px; box-shadow:0 4px 16px rgba(245,158,11,0.5);">
            ${theme.name}
          </div>
          <div style="font-size:13px; color:#cbd5e1; line-height:1.4;">${theme.description}</div>
          
          <div style="width:100%; background:rgba(0,0,0,0.5); padding:10px; border-radius:14px; font-size:12px; color:#4ade80;">
            ✅ 清理进度达到 90%，已解锁前方新领域！
          </div>

          <button id="btnEnterRegion" class="btn-primary" style="width:100%; height:48px; font-size:17px;">
            进入 ${theme.name}
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnEnterRegion').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
      this.game.resume();
    };
  }

  // ==========================================
  // 11. 车库与机器进化 (Garage Modal)
  // ==========================================
  showGarageModal() {
    this.modalContainer.style.display = 'block';
    const currentLevel = this.game.machine ? this.game.machine.level : 1;
    const coins = saveManager.data.coins;

    let listHtml = '';
    MACHINE_EVOLUTION_CONFIG.forEach((cfg) => {
      const isUnlocked = cfg.level <= currentLevel;
      const isCurrent = cfg.level === currentLevel;
      listHtml += `
        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(30,41,59,0.8); border:1.5px solid ${isCurrent ? '#38bdf8' : 'rgba(255,255,255,0.15)'}; border-radius:14px; padding:10px 12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">🚗</span>
            <div style="text-align:left;">
              <div style="font-size:14px; font-weight:bold; color:#fff;">LV.${cfg.level} ${cfg.title}</div>
              <div style="font-size:11px; color:#94a3b8;">吸附半径: ${cfg.suctionRadius}m | 可吞: T${cfg.maxTier}</div>
            </div>
          </div>
          <div>
            ${isCurrent ? '<span style="font-size:12px; color:#4ade80; font-weight:bold;">使用中</span>' : (isUnlocked ? '<span style="font-size:12px; color:#94a3b8;">已解锁</span>' : '<span style="font-size:12px; color:#f59e0b;">需质量进化</span>')}
          </div>
        </div>
      `;
    });

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:350px; max-height:85vh; padding:20px 16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:18px; font-weight:800; color:#fff;">🚗 机器进化车库</div>
            <div id="btnCloseGarage" style="font-size:20px; cursor:pointer; color:#94a3b8;">✕</div>
          </div>
          <div style="font-size:12px; color:#94a3b8;">局内吸附杂物积累质量即可触发真实外观与性能进化！</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${listHtml}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseGarage').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
    };
  }

  // ==========================================
  // 12. 皮肤装扮 (Skins Modal)
  // ==========================================
  showSkinsModal() {
    this.modalContainer.style.display = 'block';
    const curSkin = saveManager.data.currentSkinId;
    const coins = saveManager.data.coins;

    let skinsHtml = '';
    SKINS_CONFIG.forEach(s => {
      const isOwned = saveManager.data.unlockedSkins.includes(s.id);
      const isEquipped = s.id === curSkin;

      skinsHtml += `
        <div style="background:rgba(30,41,59,0.8); border:1.5px solid ${isEquipped ? '#38bdf8' : 'rgba(255,255,255,0.12)'}; border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:6px; align-items:center;">
          <div style="width:36px; height:36px; border-radius:50%; background:${s.color}; border:3px solid ${s.rimColor};"></div>
          <div style="font-size:13px; font-weight:bold; color:#fff;">${s.name}</div>
          <div style="font-size:10px; color:#94a3b8; text-align:center;">${s.description}</div>
          <button class="btn-skin-action btn-${isEquipped ? 'secondary' : 'primary'}" data-skin="${s.id}" data-price="${s.price}" style="width:100%; height:30px; font-size:11px; margin-top:4px;">
            ${isEquipped ? '装备中' : (isOwned ? '使用' : `🪙 ${s.price}`)}
          </button>
        </div>
      `;
    });

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:350px; max-height:85vh; padding:20px 16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="pill-badge">🪙 ${coins}</div>
            <div style="font-size:18px; font-weight:800; color:#fff;">🎨 皮肤装扮</div>
            <div id="btnCloseSkins" style="font-size:20px; cursor:pointer; color:#94a3b8;">✕</div>
          </div>
          <div style="font-size:11px; color:#94a3b8; text-align:center;">皮肤不影响属性，打造属于你的炫酷黑洞！</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            ${skinsHtml}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseSkins').onclick = () => { audio.playClick(); this.modalContainer.style.display = 'none'; };

    const btns = this.modalContainer.querySelectorAll('.btn-skin-action');
    btns.forEach(btn => {
      btn.onclick = () => {
        const skinId = btn.getAttribute('data-skin');
        const price = parseInt(btn.getAttribute('data-price'));
        if (saveManager.data.unlockedSkins.includes(skinId)) {
          saveManager.equipSkin(skinId);
          if (this.game.machine) this.game.machine.setSkin(skinId);
          audio.playClick();
          this.showSkinsModal();
        } else {
          if (saveManager.unlockSkin(skinId, price)) {
            if (this.game.machine) this.game.machine.setSkin(skinId);
            audio.playCoin();
            this.showSkinsModal();
          } else {
            platform.showToast('金币不足！');
          }
        }
      };
    });
  }

  // ==========================================
  // 13. 任务系统 (Tasks Modal)
  // ==========================================
  showTasksModal() {
    this.modalContainer.style.display = 'block';
    const coins = saveManager.data.coins;
    const taskData = saveManager.data.tasks;

    let tasksHtml = '';
    DAILY_TASKS_CONFIG.forEach(task => {
      const cur = taskData[task.metric] || 0;
      const isComplete = cur >= task.target;
      const isClaimed = (taskData.claimedTasks || []).includes(task.id);

      tasksHtml += `
        <div style="background:rgba(30,41,59,0.8); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
            <div style="font-size:13px; font-weight:bold; color:#fff;">${task.title}</div>
            <div style="font-size:11px; color:#94a3b8;">进度: ${Math.min(cur, task.target)} / ${task.target}</div>
          </div>
          <button class="btn-task-claim ${isComplete && !isClaimed ? 'btn-primary' : 'btn-secondary'}" data-task="${task.id}" data-reward="${task.rewardCoins}" ${isClaimed ? 'disabled' : ''} style="width:78px; height:32px; font-size:12px;">
            ${isClaimed ? '已领取' : (isComplete ? `🪙 ${task.rewardCoins}` : '前往')}
          </button>
        </div>
      `;
    });

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:350px; max-height:85vh; padding:20px 16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="pill-badge">🪙 ${coins}</div>
            <div style="font-size:18px; font-weight:800; color:#fff;">📋 每日任务</div>
            <div id="btnCloseTasks" style="font-size:20px; cursor:pointer; color:#94a3b8;">✕</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${tasksHtml}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseTasks').onclick = () => { audio.playClick(); this.modalContainer.style.display = 'none'; };

    const claimBtns = this.modalContainer.querySelectorAll('.btn-task-claim');
    claimBtns.forEach(btn => {
      btn.onclick = () => {
        const taskId = btn.getAttribute('data-task');
        const reward = parseInt(btn.getAttribute('data-reward'));
        const task = DAILY_TASKS_CONFIG.find(t => t.id === taskId);
        const cur = taskData[task.metric] || 0;

        if (cur >= task.target) {
          if (saveManager.claimTaskReward(taskId, reward)) {
            audio.playCoin();
            platform.showToast(`获得 🪙 ${reward} 金币！`, 'success');
            this.showTasksModal();
          }
        } else {
          audio.playClick();
          this.modalContainer.style.display = 'none';
          this.showModeSelectModal();
        }
      };
    });
  }

  // ==========================================
  // 14. 结算页面 (Settlement Modal)
  // ==========================================
  showSettlementModal(stats) {
    this.modalContainer.style.display = 'block';
    this.hudContainer.style.display = 'none';
    audio.playUnlock();

    const isNewHigh = saveManager.updateHighScore(stats.score);
    saveManager.addCoins(stats.coins);

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:340px; padding:24px 18px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px;">
          <div style="font-size:24px; font-weight:900; color:#ef4444;">游戏结束</div>
          <div style="font-size:13px; color:#94a3b8;">本局得分</div>
          <div style="font-size:32px; font-weight:900; color:#fff;">${stats.score.toLocaleString()}</div>
          <div style="font-size:12px; color:#ffcc00;">${isNewHigh ? '🏆 刷新历史最高分！' : `最高分: ${saveManager.data.highScore.toLocaleString()}`}</div>

          <!-- 3 格统计面板 -->
          <div style="width:100%; display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin:4px 0;">
            <div style="background:rgba(0,0,0,0.4); padding:8px 4px; border-radius:12px;">
              <div style="font-size:16px; font-weight:bold; color:#38bdf8;">${stats.absorbedCount || 0}</div>
              <div style="font-size:10px; color:#94a3b8;">吸附物品</div>
            </div>
            <div style="background:rgba(0,0,0,0.4); padding:8px 4px; border-radius:12px;">
              <div style="font-size:16px; font-weight:bold; color:#4ade80;">${stats.compressCount || 0}</div>
              <div style="font-size:10px; color:#94a3b8;">压缩次数</div>
            </div>
            <div style="background:rgba(0,0,0,0.4); padding:8px 4px; border-radius:12px;">
              <div style="font-size:16px; font-weight:bold; color:#fbbf24;">x${stats.maxCombo || 0}</div>
              <div style="font-size:10px; color:#94a3b8;">最高连击</div>
            </div>
          </div>

          <div style="font-size:18px; font-weight:800; color:#ffcc00; margin:4px 0;">
            🪙 获得金币: +${stats.coins}
          </div>

          <button id="btnDoubleReward" class="btn-primary" style="width:100%; height:46px; font-size:16px;">
            📺 双倍领取 🪙 +${stats.coins * 2}
          </button>
          <button id="btnReturnHome" class="btn-secondary" style="width:100%; height:42px; font-size:14px;">
            返回首页
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnDoubleReward').onclick = () => {
      adService.showRewardedAd('MILESTONE_DOUBLE', () => {
        saveManager.addCoins(stats.coins);
        platform.showToast(`获得双倍金币 🪙 +${stats.coins}！`, 'success');
        this.showHomeView();
      });
    };
    document.getElementById('btnReturnHome').onclick = () => {
      audio.playClick();
      this.showHomeView();
    };
  }

  // ==========================================
  // 15. 商店页面 (Shop Modal)
  // ==========================================
  showShopModal() {
    this.modalContainer.style.display = 'block';
    const coins = saveManager.data.coins;

    let itemsHtml = '';
    SHOP_ITEMS_CONFIG.forEach(item => {
      itemsHtml += `
        <div style="background:rgba(30,41,59,0.8); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:26px;">💰</span>
            <div style="text-align:left;">
              <div style="font-size:14px; font-weight:bold; color:#fff;">${item.name}</div>
              <div style="font-size:11px; color:#ffcc00;">🪙 ${item.amount} 金币</div>
            </div>
          </div>
          <button class="btn-shop-buy btn-primary" data-coins="${item.amount}" style="width:72px; height:32px; font-size:12px;">
            ¥ ${item.priceCny}
          </button>
        </div>
      `;
    });

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:350px; max-height:85vh; padding:20px 16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="pill-badge">🪙 ${coins}</div>
            <div style="font-size:18px; font-weight:800; color:#fff;">🛒 金币商店</div>
            <div id="btnCloseShop" style="font-size:20px; cursor:pointer; color:#94a3b8;">✕</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseShop').onclick = () => { audio.playClick(); this.modalContainer.style.display = 'none'; };

    const buyBtns = this.modalContainer.querySelectorAll('.btn-shop-buy');
    buyBtns.forEach(btn => {
      btn.onclick = () => {
        const amt = parseInt(btn.getAttribute('data-coins'));
        saveManager.addCoins(amt);
        audio.playCoin();
        platform.showToast(`购买成功！获得 🪙 ${amt} 金币`, 'success');
        this.showShopModal();
      };
    });
  }

  // ==========================================
  // Meta 永久属性升级 (Meta Upgrade Modal)
  // ==========================================
  showMetaUpgradeModal() {
    this.modalContainer.style.display = 'block';
    const coins = saveManager.data.coins;
    const metas = saveManager.data.metaUpgrades;

    const metaConfigs = [
      { id: 'suctionRadius', name: '基础吸附半径', icon: '🧲', desc: '提升出场初始吸力范围' },
      { id: 'moveSpeed', name: '基础移动速度', icon: '⚡', desc: '提升黑洞机动性' },
      { id: 'compressionValue', name: '压缩金币价值', icon: '📦', desc: '每次压缩产出更多金币' },
      { id: 'startingMass', name: '初始起始质量', icon: '🌌', desc: '开局自带基础质量更快进化' }
    ];

    let metaHtml = '';
    metaConfigs.forEach(m => {
      const lv = metas[m.id] || 0;
      const cost = (lv + 1) * 500;
      metaHtml += `
        <div style="background:rgba(30,41,59,0.8); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:22px;">${m.icon}</span>
            <div style="text-align:left;">
              <div style="font-size:13px; font-weight:bold; color:#fff;">${m.name} <span style="color:#38bdf8;">Lv.${lv}</span></div>
              <div style="font-size:10px; color:#94a3b8;">${m.desc}</div>
            </div>
          </div>
          <button class="btn-meta-upgrade btn-primary" data-meta="${m.id}" style="width:78px; height:32px; font-size:11px;">
            🪙 ${cost}
          </button>
        </div>
      `;
    });

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:350px; padding:20px 16px; display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="pill-badge">🪙 ${coins}</div>
            <div style="font-size:18px; font-weight:800; color:#fff;">⬆️ 永久属性强化</div>
            <div id="btnCloseMeta" style="font-size:20px; cursor:pointer; color:#94a3b8;">✕</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${metaHtml}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseMeta').onclick = () => { audio.playClick(); this.modalContainer.style.display = 'none'; };

    const upBtns = this.modalContainer.querySelectorAll('.btn-meta-upgrade');
    upBtns.forEach(btn => {
      btn.onclick = () => {
        const metaKey = btn.getAttribute('data-meta');
        const res = saveManager.upgradeMeta(metaKey);
        if (res.success) {
          audio.playPowerup();
          this.showMetaUpgradeModal();
        } else {
          platform.showToast('金币不足或已达最高级！');
        }
      };
    });
  }

  // ==========================================
  // 设置弹窗 (Settings Modal)
  // ==========================================
  showSettingsModal() {
    this.modalContainer.style.display = 'block';
    const settings = saveManager.data.settings;

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:320px; padding:22px 18px; display:flex; flex-direction:column; gap:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:18px; font-weight:800; color:#fff;">⚙️ 系统设置</div>
            <div id="btnCloseSettings" style="font-size:20px; cursor:pointer; color:#94a3b8;">✕</div>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:10px; border-radius:12px;">
              <span style="font-size:14px;">🔊 游戏音效</span>
              <input type="checkbox" id="chkSfx" ${settings.sfx ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;">
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:10px; border-radius:12px;">
              <span style="font-size:14px;">🎵 背景音乐</span>
              <input type="checkbox" id="chkMusic" ${settings.music ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;">
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:10px; border-radius:12px;">
              <span style="font-size:14px;">📳 震动反馈</span>
              <input type="checkbox" id="chkVibration" ${settings.vibration ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;">
            </div>
          </div>

          <div style="font-size:11px; color:#94a3b8; text-align:center; margin-top:4px;">
            《黑洞回收站》 v1.0.0 (${platform.getPlatformName()})
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseSettings').onclick = () => { audio.playClick(); this.modalContainer.style.display = 'none'; };

    document.getElementById('chkSfx').onchange = (e) => {
      saveManager.data.settings.sfx = e.target.checked;
      saveManager.save();
      audio.setSettings(saveManager.data.settings);
    };
    document.getElementById('chkMusic').onchange = (e) => {
      saveManager.data.settings.music = e.target.checked;
      saveManager.save();
      audio.setSettings(saveManager.data.settings);
    };
    document.getElementById('chkVibration').onchange = (e) => {
      saveManager.data.settings.vibration = e.target.checked;
      saveManager.save();
    };
  }

  // ==========================================
  // 暂停弹窗 (Pause Modal)
  // ==========================================
  showPauseModal() {
    this.game.pause();
    this.modalContainer.style.display = 'block';

    this.modalContainer.innerHTML = `
      <div style="width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; padding:16px;">
        <div class="panel-glass banner-anim" style="width:100%; max-width:300px; padding:24px 20px; display:flex; flex-direction:column; align-items:center; gap:14px;">
          <div style="font-size:22px; font-weight:900; color:#fff;">游戏暂停</div>
          <button id="btnResume" class="btn-primary" style="width:100%; height:46px; font-size:16px;">
            继续游戏
          </button>
          <button id="btnRestart" class="btn-secondary" style="width:100%; height:42px; font-size:14px;">
            重新开始
          </button>
          <button id="btnQuitHome" class="btn-secondary" style="width:100%; height:42px; font-size:14px;">
            返回首页
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnResume').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
      this.game.resume();
    };
    document.getElementById('btnRestart').onclick = () => {
      audio.playClick();
      this.modalContainer.style.display = 'none';
      this.startPlayMode(this.game.mode);
    };
    document.getElementById('btnQuitHome').onclick = () => {
      audio.playClick();
      this.showHomeView();
    };
  }
}
