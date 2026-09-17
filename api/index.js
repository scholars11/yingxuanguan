// Vercel Serverless: 首页健康检查
// 只返回状态 OK，不提供静态文件（Vercel 静态服务另有配置或不需要）
module.exports = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({
    code: 1,
    msg: '影序馆 Vercel 代理服务运行中',
    endpoints: {
      proxy: '/api/proxy?url=<目标URL>',
      poster: '/api/poster?url=<图片URL>',
    }
  }));
};
