/*
 * app-shell.js - 三端公共外壳逻辑
 * 1. 注册 Service Worker（PWA 离线打开界面）
 * 2. TV / 键盘方向键空间导航（Android TV 遥控器、电脑键盘）
 * 3. 安卓 App 首次启动且未配置服务器时的引导
 */

(function () {
  'use strict';

  /* ---------- 1. Service Worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 部分内置 WebView 不支持，静默忽略
      });
    });
  }

  /* ---------- 2. TV 遥控器 / 键盘空间导航 ---------- */
  const FOCUS_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    '.video-card',
    '.category-chip',
    '.episode-item',
    '.source-item',
    '.history-card',
    '.modal-box .btn',
  ].join(',');

  const DIRS = {
    ArrowUp:    { x: 0, y: -1 },
    ArrowDown:  { x: 0, y: 1 },
    ArrowLeft:  { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };

  function isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  }

  function focusableList() {
    return Array.from(document.querySelectorAll(FOCUS_SELECTOR)).filter(isVisible);
  }

  function rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 确保卡片类元素可聚焦（按钮/链接天然可聚焦）
  function ensureFocusable() {
    document.querySelectorAll('.video-card,.category-chip,.episode-item').forEach((el) => {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    });
  }

  function moveFocus(dir) {
    ensureFocusable();
    const list = focusableList();
    if (list.length === 0) return false;
    let current = document.activeElement;
    if (current === document.body || !list.includes(current)) {
      // 没有焦点时，方向键聚焦到第一个元素
      list[0].focus({ preventScroll: true });
      return true;
    }
    const from = rectCenter(current);
    let best = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const to = rectCenter(el);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      // 必须在目标方向上
      if (dir.x === 1 && dx <= 4) continue;
      if (dir.x === -1 && dx >= -4) continue;
      if (dir.y === 1 && dy <= 4) continue;
      if (dir.y === -1 && dy >= -4) continue;
      // 主轴距离为主，交叉轴作惩罚
      const main = dir.x !== 0 ? Math.abs(dx) : Math.abs(dy);
      const cross = dir.x !== 0 ? Math.abs(dy) : Math.abs(dx);
      const score = main + cross * 1.6;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.focus({ preventScroll: true });
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return true;
    }
    return false;
  }

  let tvNavBound = false;
  function enableTvNav() {
    if (tvNavBound) return;
    tvNavBound = true;

    // 焦点高亮样式（挂到 head 末尾以生效并获得较高优先级）
    const style = document.createElement('style');
    style.textContent =
      '.video-card:focus,.category-chip:focus,.episode-item:focus,.source-item:focus,' +
      'a:focus,button:focus,input:focus,[tabindex]:focus{' +
      'outline:3px solid #daa854 !important;outline-offset:2px;border-radius:8px;' +
      '}';
    (document.head || document.documentElement).appendChild(style);

    document.addEventListener('keydown', (e) => {
      const dir = DIRS[e.key];
      if (!dir) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      // 输入框内的方向键保留给文字编辑
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'VIDEO') return;
      if (e.defaultPrevented) return;
      if (moveFocus(dir)) e.preventDefault();
    }, true);

    // Enter 触发卡片点击（a/button 原生已处理）
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const el = document.activeElement;
      if (!el) return;
      const tag = el.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT') return;
      if (el.classList.contains('video-card') ||
          el.classList.contains('category-chip') ||
          el.classList.contains('episode-item') ||
          el.classList.contains('history-card')) {
        e.preventDefault();
        el.click();
      }
    });
  }

  // Android TV / 键盘设备立即启用；触屏手机启用也无害（仅响应物理按键）
  enableTvNav();
  // 列表为动态渲染，每次 DOM 变化补挂 tabindex
  new MutationObserver(() => ensureFocusable()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  ensureFocusable();

  /* ---------- 3. 安卓 App 原生 HTTP 绕过 CORS ---------- */
  // 安卓 Capacitor WebView 受 CORS 限制，但原生 HTTP 插件没有
  // 这里 monkey-patch fetch 和 XMLHttpRequest 让所有请求（含 hls.js 的 m3u8）都走原生层
  // 注意：Capacitor 5+ 内置插件名为 CapacitorHttp（旧版社区插件为 Http）
  function getHttpPlugin() {
    const C = window.Capacitor;
    return (C && C.Plugins && (C.Plugins.CapacitorHttp || C.Plugins.Http)) ||
           window.CapacitorHttp || null;
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function setupAndroidNativeHttp() {
    const HttpPlugin = getHttpPlugin();
    if (!HttpPlugin || typeof HttpPlugin.get !== 'function') return false;

    const NATIVE_OPTS = { connectTimeout: 15000, readTimeout: 30000 };

    // --- Patch fetch ---
    const _origFetch = window.fetch.bind(window);
    window.fetch = async function (input, init = {}) {
      const url = typeof input === 'string' ? input : input.url;
      // 仅接管绝对 http(s) 地址；data:/blob:/相对路径交还原生 fetch
      if (!url || !/^https?:\/\//.test(url)) {
        return _origFetch(input, init);
      }
      try {
        const res = await HttpPlugin.get({
          url: url,
          headers: init.headers || {},
          params: {},
          ...NATIVE_OPTS,
        });
        return new Response(res.data, {
          status: res.status,
          statusText: '',
          headers: res.headers || {},
        });
      } catch (e) {
        return _origFetch(input, init); // 降级
      }
    };

    // --- Patch XMLHttpRequest (hls.js 默认用 XHR) ---
    const _origXHROpen = XMLHttpRequest.prototype.open;
    const _origXHRSend = XMLHttpRequest.prototype.send;
    const _origXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__nativeUrl = url;
      this.__nativeMethod = String(method || 'GET').toUpperCase();
      this.__nativeHeaders = {};
      return _origXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (key, val) {
      this.__nativeHeaders = this.__nativeHeaders || {};
      this.__nativeHeaders[key] = val;
      return _origXHRSetHeader.call(this, key, val);
    };

    XMLHttpRequest.prototype.send = function () {
      const url = this.__nativeUrl;
      // 仅接管 http(s) 的 GET 请求，其余（相对路径/非GET/data:）走原生 XHR
      const ok = url && /^https?:\/\//.test(url) && this.__nativeMethod === 'GET' &&
                 this.readyState > 0;
      if (!ok) {
        return _origXHRSend.apply(this, arguments);
      }
      const headers = this.__nativeHeaders || {};
      const self = this;
      const wantAb = this.responseType === 'arraybuffer';
      // readyState 是只读属性，严格模式下直接赋值会抛错，必须用 defineProperty
      const done = () => {
        Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
        self.dispatchEvent(new Event('readystatechange'));
        self.dispatchEvent(new Event('load'));
        self.dispatchEvent(new Event('loadend'));
      };
      HttpPlugin.get({
        url,
        headers,
        params: {},
        responseType: wantAb ? 'ARRAY_BUFFER' : 'TEXT',
        ...NATIVE_OPTS,
      })
        .then((res) => {
          let data = res.data;
          if (wantAb) {
            data = base64ToArrayBuffer(typeof data === 'string' ? data : '');
            Object.defineProperty(self, 'response', { value: data, configurable: true });
          } else {
            Object.defineProperty(self, 'responseText', { value: String(data), configurable: true });
            Object.defineProperty(self, 'response', { value: String(data), configurable: true });
          }
          Object.defineProperty(self, 'status', { value: res.status, configurable: true });
          done();
        })
        .catch(() => {
          self.dispatchEvent(new Event('error'));
          self.dispatchEvent(new Event('loadend'));
          try {
            Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
          } catch (e) {}
        });
    };

    return true;
  }

  /* ---------- 4. 安卓 App 首次启动引导 ---------- */
  // 立即打补丁，不等 window load：
  // 首页在 DOMContentLoaded 就发起数据请求（早于 load），
  // 若等 load 再打补丁，首屏请求会因 CORS 失败（表现为"刚打开加载失败，重试才成功"）
  const nativeReady = setupAndroidNativeHttp();
  if (nativeReady) {
    console.log('[影序馆] 安卓原生 HTTP 已启用，所有请求绕过 CORS');
  }

  window.addEventListener('load', () => {
    if (window.Api && window.Api.isAndroid) return;
    try {
      if (localStorage.getItem('yxg_proxy_guided')) return;
      localStorage.setItem('yxg_proxy_guided', '1');
      // 安卓环境不再需要配置服务器地址（原生 HTTP 直连），不弹提示
    } catch (e) {}
  });
})();
