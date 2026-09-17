/*
 * common.js - 通用工具函数
 */

const Common = {
  // URL 参数获取
  getParam(name) {
    const u = new URL(location.href);
    return u.searchParams.get(name) || '';
  },

  // HTML 转义
  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // 截断文字
  truncate(str, len) {
    if (!str) return '';
    if (str.length <= len) return str;
    return str.slice(0, len) + '...';
  },

  // 显示加载中
  showLoading(msg) {
    let el = document.getElementById('globalLoading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalLoading';
      el.className = 'global-loading';
      el.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">' + (msg || '加载中...') + '</div>';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    el.querySelector('.loading-text').textContent = msg || '加载中...';
  },

  hideLoading() {
    const el = document.getElementById('globalLoading');
    if (el) el.style.display = 'none';
  },

  // Toast 提示
  toast(msg, duration) {
    duration = duration || 2500;
    let el = document.getElementById('globalToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalToast';
      el.className = 'global-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove('show');
    }, duration);
  },

  // 确认对话框
  confirm(msg) {
    return window.confirm(msg);
  },

  // 跳转页面
  go(page, params) {
    let url = page;
    if (params) {
      const usp = new URLSearchParams();
      for (const k in params) {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          usp.set(k, params[k]);
        }
      }
      const qs = usp.toString();
      if (qs) url += '?' + qs;
    }
    location.href = url;
  },

  // 节流
  debounce(fn, wait) {
    let t;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 300);
    };
  },

  /**
   * 跨源搜索：在指定数据源中按名称搜索视频
   * @param {string} sourceId - 数据源ID
   * @param {string} vodName - 视频名称
   * @returns {Promise<object|null>} 匹配到的视频列表项，或 null
   */
  async searchVideoInSource(sourceId, vodName) {
    // 临时切换数据源来调用API
    const prevId = Config.getCurrentSource()?.id;
    try {
      Config.setCurrentSource(sourceId);
      // 搜索第一页
      const data = await Api.getList({ wd: vodName, pg: 1 });
      const list = (data && data.list) || [];
      if (list.length === 0) return null;
      // 优先完全匹配
      const exact = list.find(x => (x.vod_name || '') === vodName);
      if (exact) return exact;
      // 其次去除末尾更新标记后匹配
      const cleanName = vodName.replace(/\s*更新第.*?集?\s*$/, '').trim();
      const semi = list.find(x => (x.vod_name || '').replace(/\s*更新第.*?集?\s*$/, '').trim() === cleanName);
      if (semi) return semi;
      // 再次包含匹配
      const include = list.find(x => (x.vod_name || '').includes(cleanName) || cleanName.includes(x.vod_name || ''));
      return include || list[0];
    } catch (e) {
      console.warn('跨源搜索失败', e);
      return null;
    } finally {
      // 恢复原数据源
      if (prevId) Config.setCurrentSource(prevId);
    }
  },

  /**
   * 切换数据源并重新加载当前页面
   * @param {string} newSourceId - 目标数据源ID
   * @param {string} vodName - 当前视频名称（用于在新源中查找）
   */
  async switchSourceAndReload(newSourceId, vodName) {
    const cur = Config.getCurrentSource();
    if (cur && cur.id === newSourceId) return;

    const targetSource = Config.getSources().find(s => s.id === newSourceId);
    if (!targetSource) { Common.toast('数据源不存在'); return; }

    Common.toast('正在从「' + targetSource.name + '」查找...', 1500);

    const match = await this.searchVideoInSource(newSourceId, vodName);
    if (!match) {
      Common.toast('该数据源暂未收录此片');
      return;
    }

    // 切换全局数据源
    Config.setCurrentSource(newSourceId);

    // 重新构建URL，用新ID
    const url = new URL(location.href);
    url.searchParams.set('id', match.vod_id);
    // 清理播放相关参数（源和集数在新源中无效）
    url.searchParams.delete('src');
    url.searchParams.delete('ep');
    location.href = url.toString();
  },
};

window.Common = Common;
