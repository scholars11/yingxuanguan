/*
 * 影序馆 本地服务
 * 功能：1. 提供静态文件服务  2. 提供跨域代理接口
 * 仅依赖 Node.js 内置模块，无需安装任何依赖
 * 启动后访问：http://localhost:5180
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5180;
const ROOT = __dirname;

// 静态文件 MIME 映射
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts':   'video/mp2t',
};

// 简单的内存缓存（用于海报图片等，减少重复代理请求）
const cache = new Map();
const CACHE_MAX = 300;
const CACHE_TTL = 30 * 60 * 1000; // 30分钟

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { value, ts: Date.now() });
}

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

// 统一输出 JSON
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

// 静态文件服务
function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  // 安全：阻止路径穿越；并去掉前导斜杠
  // （Windows 下 path.join(ROOT, '\\a.html') 会退化为相对路径，打包后导致白屏）
  const safePath = path.normalize(pathname)
    .replace(/^(\.\.[\/\\])+/, '')
    .replace(/^[\\/]+/, '');
  const filePath = path.join(ROOT, safePath);

  // 禁止对外暴露服务端/工程文件
  const BLOCKED = [
    /(^|[\\/])node_modules([\\/]|$)/,
    /(^|[\\/])\.git([\\/]|$)/,
    /(^|[\\/])\.github([\\/]|$)/,
    /[\\/](package|package-lock)\.json$/i,
    /[\\/](render\.yaml|electron-main\.js)$/i,
    /[\\/]scripts([\\/]|$)/,
    /[\\/]dist([\\/]|$)/,
  ];
  if (BLOCKED.some((re) => re.test(filePath))) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // 404 友好提示
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1><p>文件不存在：' + pathname + '</p><p><a href="/">返回首页</a></p>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// 跨域代理：GET /proxy?url=<目标URL>
function serveProxy(req, res, parsedUrl) {
  let target = parsedUrl.query.url;
  if (!target) {
    return sendJSON(res, 400, { code: 0, msg: '缺少 url 参数' });
  }

  // 支持中文等：尝试 decode
  try { target = decodeURIComponent(target); } catch (e) {}

  // 检查缓存
  const cacheKey = target;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return sendJSON(res, 200, cached);
  }

  let targetParsed;
  try {
    targetParsed = new URL(target);
  } catch (e) {
    return sendJSON(res, 400, { code: 0, msg: 'URL 格式错误' });
  }

  const lib = targetParsed.protocol === 'https:' ? https : http;

  const options = {
    hostname: targetParsed.hostname,
    port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
    path: targetParsed.pathname + targetParsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': targetParsed.origin + '/',
    },
    timeout: 15000,
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    let chunks = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('end', () => {
      const buf = Buffer.concat(chunks);
      let text;
      try { text = buf.toString('utf-8'); } catch (e) { text = ''; }

      // 尝试解析 JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // 不是 JSON，返回原始文本包裹
        data = { code: 1, msg: 'ok', raw: text };
      }
      cacheSet(cacheKey, data);
      sendJSON(res, 200, data);
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    sendJSON(res, 504, { code: 0, msg: '请求超时' });
  });

  proxyReq.on('error', (e) => {
    sendJSON(res, 502, { code: 0, msg: '代理失败：' + e.message });
  });

  proxyReq.end();
}

// 海报图片代理：/poster?url=<图片URL>
function servePoster(req, res, parsedUrl) {
  let target = parsedUrl.query.url;
  if (!target) {
    res.writeHead(400);
    res.end('missing url');
    return;
  }
  try { target = decodeURIComponent(target); } catch (e) {}

  const cached = cacheGet('poster:' + target);
  if (cached) {
    res.writeHead(200, { 'Content-Type': cached.mime, 'Cache-Control': 'public, max-age=86400' });
    res.end(cached.buf);
    return;
  }

  let targetParsed;
  try {
    targetParsed = new URL(target);
  } catch (e) {
    res.writeHead(400);
    res.end('bad url');
    return;
  }

  const lib = targetParsed.protocol === 'https:' ? https : http;
  const options = {
    hostname: targetParsed.hostname,
    port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
    path: targetParsed.pathname + targetParsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Referer': targetParsed.origin + '/',
    },
    timeout: 10000,
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    const mime = proxyRes.headers['content-type'] || 'image/jpeg';
    let chunks = [];
    proxyRes.on('data', (c) => chunks.push(c));
    proxyRes.on('end', () => {
      const buf = Buffer.concat(chunks);
      cacheSet('poster:' + target, { buf, mime });
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
      res.end(buf);
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504);
    res.end('timeout');
  });

  proxyReq.on('error', () => {
    res.writeHead(502);
    res.end('proxy error');
  });

  proxyReq.end();
}

// 主服务
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '/';

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  if (pathname === '/proxy') {
    return serveProxy(req, res, parsedUrl);
  }
  if (pathname === '/poster') {
    return servePoster(req, res, parsedUrl);
  }

  return serveStatic(req, res, pathname);
});

// 启动服务（供 Electron 或其他模块调用）
// port 传 0 表示由系统随机分配；host 默认仅本机可访问
function startServer(port, host) {
  const listenPort = port || PORT;
  const listenHost = host || '127.0.0.1';
  return new Promise((resolve, reject) => {
    server.listen(listenPort, listenHost, () => resolve(server));
    server.once('error', reject);
  });
}

// 直接运行（node server.js）：固定端口并自动打开浏览器
if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : PORT;
  // 云平台部署时通过 HOST=0.0.0.0 允许外部访问
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    const shownHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log('');
    console.log('========================================');
    console.log('  影序馆 本地服务已启动');
    console.log('========================================');
    console.log('  访问地址：http://' + shownHost + ':' + port);
    console.log('  跨域代理：http://' + shownHost + ':' + port + '/proxy?url=目标URL');
    console.log('  海报代理：http://' + shownHost + ':' + port + '/poster?url=图片URL');
    console.log('----------------------------------------');
    console.log('  按 Ctrl+C 可停止服务');
    console.log('========================================');
    console.log('');
    // 仅本机运行时自动打开浏览器
    if (!process.env.HOST) {
      const exec = require('child_process').exec;
      const cmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(cmd + ' http://localhost:' + port);
    }
  });
}

module.exports = { startServer, server };
