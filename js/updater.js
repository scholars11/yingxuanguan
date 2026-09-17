/*
 * updater.js - 版本更新检查
 * 启动后延迟静默检查 GitHub Releases（每天最多一次），发现新版本弹窗提醒
 * 手动检查：数据源管理弹窗内的"检查更新"按钮
 * 说明：api.github.com 在部分网络下无法访问，检查失败时静默处理，不影响使用
 */

const Updater = {
  REPO: 'scholars11/yingxuanguan',
  LAST_CHECK_KEY: 'yxg_update_last_check',
  DAY: 4 * 3600 * 1000, // 静默检查间隔：4 小时

  // 当前版本（与 package.json 保持一致）
  get current() {
    return (window.Config && Config.APP_VERSION) || '0.0.0';
  },

  init() {
    const start = () => setTimeout(() => this.check(false), 6000);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
    // 从后台切回前台时也检查（仍受间隔限制，不会频繁打扰）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.check(false);
    });
  },

  // 检查更新；manual=true 时显示"已是最新/检查失败"提示
  async check(manual) {
    // 距上次静默检查不足间隔则跳过
    if (!manual) {
      try {
        const last = parseInt(localStorage.getItem(this.LAST_CHECK_KEY) || '0');
        if (Date.now() - last < this.DAY) return;
      } catch (e) {}
    }
    try {
      try { localStorage.setItem(this.LAST_CHECK_KEY, String(Date.now())); } catch (e) {}

      const target = 'https://api.github.com/repos/' + this.REPO + '/releases/latest';
      const resp = await fetch(Api.wrap(target), {
        headers: { 'Accept': 'application/vnd.github+json' },
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const rel = await resp.json();
      const tag = String(rel.tag_name || '').replace(/^v/i, '');
      if (!tag) throw new Error('无版本号');

      if (!this.isNewer(tag, this.current)) {
        if (manual) Common.toast('当前已是最新版本 v' + this.current);
        return;
      }
      this.showModal(tag, rel);
    } catch (e) {
      if (manual) Common.toast('检查失败：网络无法访问更新服务器');
    }
  },

  // 比较版本号 a > b
  isNewer(a, b) {
    const pa = String(a).split('.');
    const pb = String(b).split('.');
    for (let i = 0; i < 3; i++) {
      const x = parseInt(pa[i]) || 0;
      const y = parseInt(pb[i]) || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  },

  // 更新提醒弹窗
  showModal(tag, rel) {
    let modal = document.getElementById('updateModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'updateModal';
      modal.className = 'modal-mask';
      document.body.appendChild(modal);
    }
    const apk = (rel.assets || []).find(a => /android/i.test(a.name) && /\.apk$/i.test(a.name));
    const htmlUrl = rel.html_url || ('https://github.com/' + this.REPO + '/releases');
    const body = rel.body ? String(rel.body).slice(0, 500) : '';

    modal.innerHTML = `
      <div class="modal-box" style="max-width:360px;">
        <div class="modal-header">
          <h3>发现新版本 v${Common.escape(tag)}</h3>
          <button class="modal-close" onclick="document.getElementById('updateModal').classList.remove('show')">×</button>
        </div>
        <div class="modal-body" style="font-size:13px;">
          <div>当前版本：v${Common.escape(this.current)} →
            <span style="color:var(--c-primary);font-weight:600;">v${Common.escape(tag)}</span>
          </div>
          ${body ? `<div style="margin-top:8px;color:var(--c-text-soft);white-space:pre-wrap;max-height:150px;overflow:auto;border:1px solid var(--c-border,#2a2e36);border-radius:8px;padding:8px;">${Common.escape(body)}</div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('updateModal').classList.remove('show')">稍后再说</button>
          <button class="btn btn-primary" id="updateGoBtn">立即更新</button>
        </div>
      </div>
    `;
    modal.classList.add('show');

    document.getElementById('updateGoBtn').onclick = () => {
      if (Api.isAndroid && apk) {
        // 安卓：跳转下载链接，系统下载管理器接管，下载完点开 APK 安装
        Common.toast('开始下载新版本，完成后打开安装', 4000);
        location.href = apk.browser_download_url;
      } else {
        // 电脑版/网页：打开发布页下载
        window.open(htmlUrl, '_blank');
      }
    };
  },
};

window.Updater = Updater;
Updater.init();
