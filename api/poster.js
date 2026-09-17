// Vercel Serverless: /poster?url=<图片URL>
// 作用：绕过 CORS，代理海报图片
const https = require('https');
const http = require('http');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=86400',
};

module.exports = (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    res.end();
    return;
  }

  const target = req.query.url;
  if (!target) {
    res.writeHead(400);
    res.end('missing url');
    return;
  }

  let urlStr;
  try { urlStr = decodeURIComponent(target); } catch (e) { urlStr = target; }

  let parsed;
  try { parsed = new URL(urlStr); } catch (e) {
    res.writeHead(400);
    res.end('bad url');
    return;
  }

  const lib = parsed.protocol === 'https:' ? https : http;
  const opts = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Referer': parsed.origin + '/',
    },
    timeout: 10000,
  };

  const proxyReq = lib.request(opts, (proxyRes) => {
    const mime = proxyRes.headers['content-type'] || 'image/jpeg';
    res.writeHead(200, { ...CORS, 'Content-Type': mime });
    proxyRes.pipe(res);
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
};
