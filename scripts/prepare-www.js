/*
 * prepare-www.js - 准备 Capacitor 网页资源目录 www/
 * 1. 清理并复制界面运行所需的静态文件（不含 node_modules、桌面端脚本）
 * 2. 将 config.js 中的 __ONLINE_PROXY__ 占位替换为环境变量 ONLINE_PROXY
 *    （手机/TV 版内置的默认公网代理地址；不设置则留空，由用户在设置页填写）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const ONLINE_PROXY = (process.env.ONLINE_PROXY || '').trim().replace(/\/+$/, '');

// 需要复制的条目（相对根目录）
const COPY = [
  'index.html',
  'detail.html',
  'play.html',
  'manifest.webmanifest',
  'sw.js',
  'css',
  'js',
  'icons',
];

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDir(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

rmrf(WWW);
fs.mkdirSync(WWW, { recursive: true });

for (const item of COPY) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.warn('跳过不存在的条目：' + item);
    continue;
  }
  const dst = path.join(WWW, item);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dst);
  } else {
    fs.copyFileSync(src, dst);
  }
}

// 替换内置线上代理地址占位
const configPath = path.join(WWW, 'js', 'config.js');
if (fs.existsSync(configPath)) {
  let code = fs.readFileSync(configPath, 'utf-8');
  code = code.replace(/__ONLINE_PROXY__/g, ONLINE_PROXY);
  fs.writeFileSync(configPath, code);
}

console.log('www 目录已生成' + (ONLINE_PROXY ? '，内置服务器地址：' + ONLINE_PROXY : '（未内置服务器地址，用户需在设置页填写）'));
