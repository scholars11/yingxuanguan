/*
 * sw.js - Service Worker
 * 策略：界面静态资源预缓存 + 缓存优先（离线可打开界面）
 *       /proxy 与 /poster 为动态接口，始终走网络，不缓存
 */

const CACHE_VERSION = 'yxg-static-v4';

const CORE_ASSETS = [
  './',
  './index.html',
  './detail.html',
  './play.html',
  './download.html',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/common.js',
  './js/history.js',
  './js/updater.js',
  './js/home.js',
  './js/detail.js',
  './js/play.js',
  './js/source-manager.js',
  './js/app-shell.js',
  './js/vendor/hls.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // 个别资源失败不阻塞安装
    await Promise.all(CORE_ASSETS.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_VERSION ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 仅处理同源请求
  if (url.origin !== self.location.origin) return;

  // 动态接口：仅网络
  if (url.pathname.startsWith('/proxy') || url.pathname.startsWith('/poster')) {
    return;
  }

  // 静态资源：缓存优先，未命中则回源并写入缓存
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: false });
    if (hit) return hit;
    try {
      const resp = await fetch(req);
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    } catch (e) {
      // 离线且未缓存导航请求时，回退到首页
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw e;
    }
  })());
});
