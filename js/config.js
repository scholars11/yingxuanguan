/*
 * config.js - 数据源配置管理
 * 通过 localStorage 持久化，用户在页面管理，无需改代码
 */

const Config = {
  STORAGE_KEY: 'yingxuanguan_sources_v1',
  CURRENT_KEY: 'yingxuanguan_current_v1',
  SETTINGS_KEY: 'yingxuanguan_settings_v1',
  PROXY_KEY: 'yingxuanguan_proxy_v1',

  // 应用当前版本（与 package.json version 保持一致，用于更新检查）
  APP_VERSION: '1.1.3',

  // 线上代理地址（打包手机/TV 安装包时可被替换；为空表示用当前网站同源地址）
  // 电脑版软件会自动使用内置服务，无需填写
  ONLINE_PROXY: '__ONLINE_PROXY__',

  // 旧默认源的 URL，用于迁移判断
  OLD_DEFAULT_URL: 'https://api.apibdzy.com/api.php/provide/vod/',

  // 默认数据源（用户首次打开时引导使用，可在页面修改/删除）
  // 均为苹果CMS V10 标准接口，播放器会自动筛选其中的 m3u8 播放源
  defaultSources: [
    {
      id: 'src_default_1',
      name: '百度云资源',
      url: 'https://api.apibdzy.com/api.php/provide/vod/',
      enabled: true,
    },
    {
      id: 'src_default_2',
      name: '无尽资源',
      url: 'https://api.wujinapi.com/api.php/provide/vod/',
      enabled: true,
    },
    {
      id: 'src_default_3',
      name: '非凡资源',
      url: 'https://cj.ffzyapi.com/api.php/provide/vod/',
      enabled: true,
    },
    {
      id: 'src_default_4',
      name: '量子资源',
      url: 'https://cj.lziapi.com/api.php/provide/vod/',
      enabled: true,
    },
    {
      id: 'src_default_5',
      name: '暴风资源',
      url: 'https://bfzyapi.com/api.php/provide/vod/',
      enabled: true,
    },
  ],

  // 读取所有数据源
  getSources() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) {
        this.saveSources(this.defaultSources);
        return this.defaultSources;
      }
      let arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) {
        arr = this.defaultSources;
        this.saveSources(arr);
        return arr;
      }
      // 迁移：如果用户还在用旧的单默认源，替换为新的多默认源列表
      // 匹配条件：只有 1 个源，且该源是旧的默认源（id 或 URL 匹配）
      const isOldSingleDefault =
        arr.length === 1 &&
        (arr[0].id === 'src_default_1' || arr[0].url === this.OLD_DEFAULT_URL) &&
        arr[0].name === '示例资源站';
      // 兼容：只有 1 个源且 URL 是旧默认地址（名称可能被改过）
      const isOldByUrl =
        arr.length === 1 && arr[0].url === this.OLD_DEFAULT_URL;
      if (isOldSingleDefault || isOldByUrl) {
        arr = this.defaultSources;
        this.saveSources(arr);
      }
      return arr;
    } catch (e) {
      return this.defaultSources;
    }
  },

  // 保存所有数据源
  saveSources(arr) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(arr));
  },

  // 获取当前选中的数据源
  getCurrentSource() {
    const sources = this.getSources().filter(s => s.enabled);
    if (sources.length === 0) return null;
    const curId = localStorage.getItem(this.CURRENT_KEY);
    const found = sources.find(s => s.id === curId);
    return found || sources[0];
  },

  // 设置当前数据源
  setCurrentSource(id) {
    localStorage.setItem(this.CURRENT_KEY, id);
  },

  // 新增/编辑数据源
  upsertSource(source) {
    const arr = this.getSources();
    const idx = arr.findIndex(s => s.id === source.id);
    if (idx >= 0) {
      arr[idx] = source;
    } else {
      arr.push(source);
    }
    this.saveSources(arr);
  },

  // 删除数据源
  deleteSource(id) {
    const arr = this.getSources().filter(s => s.id !== id);
    this.saveSources(arr);
    if (localStorage.getItem(this.CURRENT_KEY) === id) {
      localStorage.removeItem(this.CURRENT_KEY);
    }
  },

  // 生成唯一ID
  genId() {
    return 'src_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  },

  // 读取设置
  getSettings() {
    try {
      const raw = localStorage.getItem(this.SETTINGS_KEY);
      if (!raw) return { postersEnabled: true, pageSize: 20 };
      return JSON.parse(raw);
    } catch (e) {
      return { postersEnabled: true, pageSize: 20 };
    }
  },

  // 保存设置
  saveSettings(obj) {
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(obj));
  },

  // 读取代理服务地址：
  // 用户手动设置 > 打包内置的线上地址 > 空（同源，电脑版/网页部署时适用）
  getProxyBase() {
    let v = '';
    try {
      v = (localStorage.getItem(this.PROXY_KEY) || '').trim();
    } catch (e) {}
    if (/^https?:\/\//.test(v)) return v.replace(/\/+$/, '');
    if (/^https?:\/\//.test(this.ONLINE_PROXY || '')) {
      return this.ONLINE_PROXY.replace(/\/+$/, '');
    }
    return '';
  },

  // 保存代理地址（传空串表示恢复默认/同源）
  setProxyBase(url) {
    const v = (url || '').trim();
    if (v) {
      localStorage.setItem(this.PROXY_KEY, v.replace(/\/+$/, ''));
    } else {
      localStorage.removeItem(this.PROXY_KEY);
    }
  },
};

// 暴露到全局
window.Config = Config;
