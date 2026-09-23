System.register([], function (_export, _context) {
  "use strict";

  var cc, Application;

  /**
   * Region-scoped Asset Bundles that the launch scene already references.
   *
   * Game.scene's authored Golden City cell serializes seven commercial-district
   * meshes that live in the `world-city` bundle, so the bundle must be resident
   * before the launch scene is deserialized. The engine loads
   * `settings.assets.preloadBundles` before the launch scene but offers no error
   * surface, so this template loads the region bundles itself between
   * `game.init()` and `game.run()`: `run()` is what schedules the launch scene,
   * which makes this the only point where project-controlled, retryable loading
   * still precedes the first screen.
   *
   * Keep in sync with REGION_ASSET_BUNDLES in
   * cocos/assets/scripts/world/InfiniteWorldManager.ts.
   */
  var BOOT_BUNDLES = ['world-city'];
  var BOOT_BUNDLE_MAX_ATTEMPTS = 4;
  var BOOT_BUNDLE_RETRY_DELAY_MS = 300;

  function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
  function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
  function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
  function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
  function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }

  function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }

  function loadBundle(name) {
    return new Promise(function (resolve, reject) {
      cc.assetManager.loadBundle(name, function (error, bundle) {
        if (error || !bundle) reject(error || new Error('bundle ' + name + ' resolved to nothing'));
        else resolve(bundle);
      });
    });
  }

  /**
   * A region whose art never arrived cannot be shown at all, so the player gets
   * an explicit message and a real Retry instead of an empty first screen.
   * Resolves only when the player chooses to retry; the other branch leaves the
   * game (mini game) or keeps a persistent overlay with a Retry button (web).
   */
  function reportBootFailure(message, onRetry) {
    console.error('[boot] ' + message);
    if (typeof wx !== 'undefined' && wx.showModal) {
      wx.showModal({
        title: '资源加载失败',
        content: message + '\n请检查网络后重试。',
        confirmText: '重试',
        cancelText: '退出',
        success: function (result) {
          if (result && result.confirm) onRetry();
          else if (wx.exitMiniProgram) wx.exitMiniProgram({});
        },
      });
      return;
    }
    if (typeof tt !== 'undefined' && tt.showModal) {
      tt.showModal({
        title: '资源加载失败',
        content: message + '\n请检查网络后重试。',
        confirmText: '重试',
        cancelText: '退出',
        success: function (result) {
          if (result && result.confirm) onRetry();
          else if (tt.exitMiniProgram) tt.exitMiniProgram({});
        },
      });
      return;
    }
    if (typeof document !== 'undefined' && document.body) {
      var overlay = document.createElement('div');
      overlay.setAttribute('data-boot-failure', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;'
        + 'align-items:center;justify-content:center;gap:16px;background:#101820;color:#f4f6f8;'
        + 'font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;';
      var label = document.createElement('p');
      label.textContent = message + ' 请检查网络后重试。';
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = '重试';
      button.style.cssText = 'padding:12px 32px;font-size:16px;border:0;border-radius:8px;'
        + 'background:#4c9aff;color:#08121f;cursor:pointer;';
      button.addEventListener('click', function () { overlay.remove(); onRetry(); });
      overlay.appendChild(label);
      overlay.appendChild(button);
      document.body.appendChild(overlay);
      return;
    }
    console.error('[boot] no interactive surface available for the retry prompt.');
  }

  /**
   * Loads every boot bundle, retrying each one before it is allowed to fail.
   * The returned promise resolves only once all of them are resident, so
   * `game.run()` — and therefore the launch scene — cannot start early.
   */
  function ensureBootBundles() {
    var bundleIndex = 0;

    function nextBundle() {
      if (bundleIndex >= BOOT_BUNDLES.length) return Promise.resolve();
      var name = BOOT_BUNDLES[bundleIndex];
      var attempt = 0;

      function attemptLoad() {
        attempt += 1;
        return loadBundle(name)
          .then(function () {
            bundleIndex += 1;
            return nextBundle();
          })
          .catch(function (error) {
            console.warn('[boot] bundle "' + name + '" failed on attempt ' + attempt + ':', error);
            if (attempt < BOOT_BUNDLE_MAX_ATTEMPTS) {
              return wait(BOOT_BUNDLE_RETRY_DELAY_MS * attempt).then(attemptLoad);
            }
            return new Promise(function (resolve) {
              reportBootFailure('区域资源加载失败：' + name + '（已尝试 ' + attempt + ' 次）', function () {
                attempt = 0;
                resolve(attemptLoad());
              });
            });
          });
      }

      return attemptLoad();
    }

    return nextBundle();
  }

  return {
    setters: [],
    execute: function () {
      _export("Application", Application = /*#__PURE__*/function () {
        function Application() {
          _classCallCheck(this, Application);
          this.settingsPath = 'src/settings.json';
          this.showFPS = false;
        }
        _createClass(Application, [{
          key: "init",
          value: function init(engine) {
            cc = engine;
            cc.game.onPostBaseInitDelegate.add(this.onPostInitBase.bind(this));
            cc.game.onPostSubsystemInitDelegate.add(this.onPostSystemInit.bind(this));
          }
        }, {
          key: "onPostInitBase",
          value: function onPostInitBase() {
            // cc.settings.overrideSettings('assets', 'server', '');
            // do custom logic
          }
        }, {
          key: "onPostSystemInit",
          value: function onPostSystemInit() {
            // do custom logic
          }
        }, {
          key: "start",
          value: function start() {
            return cc.game.init({
              debugMode: false ? cc.DebugMode.INFO : cc.DebugMode.ERROR,
              settingsPath: this.settingsPath,
              overrideSettings: {
                // assets: {
                //      preloadBundles: [{ bundle: 'main', version: 'xxx' }],
                // }
                profiling: {
                  showFPS: this.showFPS
                }
              }
            }).then(function () {
              // Region art the launch scene already references has to be resident
              // before game.run() schedules that scene.
              return ensureBootBundles();
            }).then(function () {
              return cc.game.run();
            });
          }
        }]);
        return Application;
      }());
    }
  };
});
