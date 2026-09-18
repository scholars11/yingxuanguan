/*
 * app-shell.js - 电脑版公共外壳逻辑
 * 1. 注册 Service Worker（离线可打开界面）
 * 2. 键盘方向键空间导航（方向键选择、Enter 确认）
 */

(function () {
  'use strict';

  /* ---------- 1. Service Worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 部分浏览器不支持，静默忽略
      });
    });
  }

  /* ---------- 2. 键盘方向键空间导航 ---------- */
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

  let navBound = false;
  function enableKeyNav() {
    if (navBound) return;
    navBound = true;

    // 焦点高亮样式
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

  // 电脑版启用键盘方向键导航
  enableKeyNav();
  // 列表为动态渲染，每次 DOM 变化补挂 tabindex
  new MutationObserver(() => ensureFocusable()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  ensureFocusable();
})();
