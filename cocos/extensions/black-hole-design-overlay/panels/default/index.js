'use strict';

const fs = require('fs');
const path = require('path');
const REFERENCES = Object.freeze({
  home: 'v2-01-home.png', 'mode-select': 'v2-02-mode-select.png',
  arena_hud: 'v2-03-arena-hud.png', revive: 'v2-04-revive.png', settlement: 'v2-05-settlement.png',
});

module.exports = Editor.Panel.define({
  template: fs.readFileSync(path.join(__dirname, '../../static/template/default/index.html'), 'utf8'),
  style: fs.readFileSync(path.join(__dirname, '../../static/style/default/index.css'), 'utf8'),
  $: {
    page: '#page',
    opacity: '#opacity',
    opacityValue: '#opacity-value',
    result: '#result',
    exportButton: '#export',
    refreshButton: '#refresh',
    reference: '#reference',
    actual: '#actual',
    actualFile: '#actual-file',
    toggle: '#toggle',
    imageStatus: '#image-status',
  },
  methods: {
    async inspect() {
      this._lastReport = null;
      const page = this.$.page?.value || 'arena_hud';
      this.$.result.textContent = 'Reading current scene (read-only)…';
      try {
        const report = await Editor.Message.request('scene', 'execute-scene-script', {
          name: 'black-hole-design-overlay',
          method: 'inspectCurrentScene',
          args: [page],
        });
        this._lastReport = report;
        this.$.result.textContent = JSON.stringify(report, null, 2);
      } catch (error) {
        this.$.result.textContent = `Inspection failed: ${error?.stack || error}`;
      }
    },
    async exportReport() {
      if (!this._lastReport) await this.inspect();
      if (!this._lastReport) return;
      try {
        const result = await Editor.Message.request('scene', 'execute-scene-script', {
          name: 'black-hole-design-overlay',
          method: 'exportAuditReport',
          args: [this._lastReport],
        });
        this.$.result.textContent = `${this.$.result.textContent}\n\nEXPORTED\n${JSON.stringify(result, null, 2)}`;
      } catch (error) {
        this.$.result.textContent = `${this.$.result.textContent}\n\nExport failed: ${error?.stack || error}`;
      }
    },
    updateOpacity() {
      const value = Number(this.$.opacity.value) / 100;
      this.$.opacityValue.textContent = `${Math.round(value * 100)}%`;
      this.$.reference.style.opacity = String(value);
      this.$.reference.hidden = !this.$.toggle.checked || !this.$.reference.getAttribute('src');
    },
    loadReference() {
      const filename = REFERENCES[this.$.page.value];
      this.$.reference.hidden = true;
      this.$.reference.removeAttribute('src');
      // A screenshot from the previous page must never remain under a new reference.
      this.$.actual.hidden = true;
      this.$.actual.removeAttribute('src');
      this.$.actualFile.value = '';
      this.$.imageStatus.textContent = '尚未载入本页实际截图；此处仅显示参考图，不是运行证据。';
      if (!filename) return;
      try {
        const bytes = fs.readFileSync(path.resolve(__dirname, '../../../../docs/design-reference', filename));
        this.$.reference.src = `data:image/png;base64,${bytes.toString('base64')}`;
        this.updateOpacity();
      } catch (error) {
        this.$.imageStatus.textContent = `REFERENCE_MISSING: ${error.message}`;
      }
    },
    async loadActual() {
      const file = this.$.actualFile.files?.[0];
      this.$.actual.hidden = true;
      this.$.actual.removeAttribute('src');
      if (!file) return;
      const page = this.$.page.value;
      const bytes = Buffer.from(await file.arrayBuffer());
      if (page !== this.$.page.value || file !== this.$.actualFile.files?.[0]) return;
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!png && !jpeg) {
        this.$.imageStatus.textContent = 'INVALID_SCREENSHOT: 请选择真实 PNG/JPEG 文件。';
        return;
      }
      this.$.actual.onload = () => {
        const w = this.$.actual.naturalWidth;
        const h = this.$.actual.naturalHeight;
        // Full tall-device frames include a different field of view/safe area.
        // Do not stretch them to 9:16 and call that a layout comparison.
        if (Math.abs(w / h - 720 / 1280) > .002) {
          this.$.actual.hidden = true;
          this.$.imageStatus.textContent = `ASPECT_MISMATCH: ${w}×${h}；需要720×1280设计区域截图，不能拉伸整机画面做Diff。`;
          return;
        }
        this.$.actual.hidden = false;
        this.$.imageStatus.textContent = `手动载入 ${file.name} (${w}×${h})；来源与页面需核验，叠图不代表验收通过。`;
      };
      this.$.actual.onerror = () => {
        this.$.actual.hidden = true;
        this.$.imageStatus.textContent = 'INVALID_SCREENSHOT: 图片解码失败。';
      };
      this.$.actual.src = `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
    },
  },
  ready() {
    this._lastReport = null;
    this.$.refresh?.addEventListener('click', () => this.inspect());
    this.$.exportButton?.addEventListener('click', () => this.exportReport());
    this.$.opacity?.addEventListener('input', () => this.updateOpacity());
    this.$.toggle?.addEventListener('change', () => this.updateOpacity());
    this.$.page?.addEventListener('change', () => { this.loadReference(); this.inspect(); });
    this.$.actualFile?.addEventListener('change', () => this.loadActual().catch((error) => {
      this.$.imageStatus.textContent = `SCREENSHOT_LOAD_FAILED: ${error.message}`;
    }));
    this.loadReference();
    this.updateOpacity();
    this.inspect();
  },
});
