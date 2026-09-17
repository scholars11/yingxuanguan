// Vercel Serverless: /proxy?url=<目标URL>
// 作用：绕过 CORS，代理视频源 API 请求
const https = require('https');
const http = require('http');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'no-store',
};

module.exports = (req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const target = req.query.url;
  if (!target) {
    res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, msg: '缺少 url 参数' }));
    return;
  }

  let urlStr;
  try { urlStr = decodeURIComponent(target); } catch (e) { urlStr = target; }

  let parsed;
  try { parsed = new URL(urlStr); } catch (e) {
    res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, msg: 'URL 格式错误' }));
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
      'Accept': 'application/json, text/plain, */*',
      'Referer': parsed.origin + '/',
    },
    timeout: 15000,
  };

  const proxyReq = lib.request(opts, (proxyRes) => {
    let chunks = [];
    proxyRes.on('data', (c) => chunks.push(c));
    proxyRes.on('end', () => {
      const buf = Buffer.concat(chunks);
      let text;
      try { text = buf.toString('utf-8'); } catch (e) { text = ''; }
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { code: 1, msg: 'ok', raw: text }; }
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504, CORS);
    res.end(JSON.stringify({ code: 0, msg: '请求超时' }));
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502, CORS);
    res.end(JSON.stringify({ code: 0, msg: '代理失败：' + e.message }));
  });

  proxyReq.end();
};
