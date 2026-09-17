/*
 * api.js - 接口请求封装
 * 电脑版：经过内置 Node.js 代理 server.js
 * 手机/TV (Android Capacitor)：用原生 HTTP 直连，绕过 CORS，无需任何云代理
 */

// 判断是否在安卓 App 内（Capacitor）
function isAndroidCapacitor() {
  return !!(window.Capacitor &&
    typeof window.Capacitor.getPlatform === 'function' &&
    window.Capacitor.getPlatform() === 'android');
}

const Api = {
  // 安卓 App 内：直接请求数据源 API，不走代理（原生 HTTP 绕过 CORS）
  get isAndroid() { return isAndroidCapacitor(); },

  // 电脑版/浏览器：服务基础地址，默认同源（server.js）
  get LOCAL() {
    if (this.isAndroid) return ''; // 安卓直连
    const base = (window.Config && Config.getProxyBase()) || location.origin;
    return base.replace(/\/+$/, '');
  },
  get PROXY() {
    return this.LOCAL + '/proxy?url=';
  },
  get POSTER() {
    return this.LOCAL + '/poster?url=';
  },

  // 拼接代理URL（安卓 App 内直接返回原 URL，原生 HTTP 绕过 CORS）
  wrap(targetUrl) {
    if (this.isAndroid) return targetUrl;
    return this.PROXY + encodeURIComponent(targetUrl);
  },

  // 包装海报URL
  wrapPoster(url) {
    if (!url) return '';
    if (this.isAndroid) return url; // 安卓 App 内直连
    if (url.startsWith('data:') || url.startsWith(this.LOCAL)) return url;
    return this.POSTER + encodeURIComponent(url);
  },

  // 规范化基础URL（确保以/结尾）
  normalizeBase(base) {
    if (!base) return '';
    base = base.trim();
    if (!base.endsWith('/')) base += '/';
    return base;
  },

  // 获取当前数据源基础地址
  getBase() {
    const src = Config.getCurrentSource();
    if (!src) return '';
    return this.normalizeBase(src.url);
  },

  // 通用请求
  async request(targetUrl) {
    const url = this.wrap(targetUrl);
    const resp = await fetch(url, { timeout: 20000 });
    if (!resp.ok) {
      throw new Error('请求失败：HTTP ' + resp.status);
    }
    const data = await resp.json();
    return data;
  },

  // 获取列表
  // params: { pg, t, wd }
  async getList(params = {}) {
    const base = this.getBase();
    if (!base) throw new Error('未配置数据源，请先在右上角设置中添加数据源');
    const u = new URL(base);
    u.searchParams.set('ac', 'list');
    if (params.pg) u.searchParams.set('pg', params.pg);
    if (params.t) u.searchParams.set('t', params.t);
    if (params.wd) u.searchParams.set('wd', params.wd);
    return this.request(u.toString());
  },

  // 获取详情
  async getDetail(ids) {
    const base = this.getBase();
    if (!base) throw new Error('未配置数据源');
    const u = new URL(base);
    u.searchParams.set('ac', 'detail');
    u.searchParams.set('ids', ids);
    return this.request(u.toString());
  },

  // 批量获取详情（用于列表页海报加载）
  async getDetailBatch(idsArr) {
    return this.getDetail(idsArr.join(','));
  },

  // 解析播放源
  // 返回: [{ name, episodes: [{name, url}] }]
  parsePlaySources(playFrom, playUrl) {
    if (!playFrom || !playUrl) return [];
    const fromNames = String(playFrom).split('$$$');
    const urlParts = String(playUrl).split('$$$');
    const result = [];
    for (let i = 0; i < urlParts.length; i++) {
      const fromName = fromNames[i] || ('源' + (i + 1));
      const epStr = urlParts[i] || '';
      const episodes = this.parseEpisodes(epStr);
      if (episodes.length > 0) {
        result.push({ name: fromName, episodes });
      }
    }
    return result;
  },

  // 解析剧集列表
  // 格式: 第1集$地址#第2集$地址
  parseEpisodes(epStr) {
    if (!epStr) return [];
    const items = epStr.split('#');
    const list = [];
    for (const it of items) {
      const parts = it.split('$');
      if (parts.length < 2) continue;
      const name = parts[0].trim();
      const url = parts.slice(1).join('$').trim();
      if (name && url) {
        list.push({ name, url });
      }
    }
    return list;
  },

  // 判断URL是否为m3u8
  isM3u8(url) {
    if (!url) return false;
    return url.toLowerCase().includes('.m3u8');
  },

  // 筛选m3u8播放源
  filterM3u8Sources(sources) {
    if (!sources || sources.length === 0) return [];
    // 优先包含m3u8的源
    const m3u8Sources = sources.filter(s => {
      const nameHasM3u8 = s.name.toLowerCase().includes('m3u8');
      const urlHasM3u8 = s.episodes.some(ep => this.isM3u8(ep.url));
      return nameHasM3u8 || urlHasM3u8;
    });
    if (m3u8Sources.length > 0) return m3u8Sources;
    // 没有m3u8源，返回所有源
    return sources;
  },
};

window.Api = Api;
