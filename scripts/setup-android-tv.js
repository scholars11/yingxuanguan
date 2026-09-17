/*
 * setup-android-tv.js - 在 Capacitor 生成的 android 工程中注入 Android TV 支持
 * 必须在 `npx cap add android` 与 `cap sync` 之后运行：
 *   1. AndroidManifest.xml 增加 LEANBACK_LAUNCHER 启动入口（同一 APK 可在 TV 桌面显示）
 *   2. application 增加 android:banner（TV 桌面横幅图标，必需）
 *   3. 声明 leanback / touchscreen 均为 required=false（手机和电视都能装同一个包）
 *   4. 复制 320x180 横幅到 res/drawable-xhdpi/tv_banner.png
 */

const fs = require('fs');
const path = require('path');

const ANDROID_DIR = path.join(__dirname, '..', 'android');
const MANIFEST = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
const BANNER_SRC = path.join(__dirname, '..', 'icons', 'tv-banner-320x180.png');
const BANNER_DST_DIR = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'drawable-xhdpi');
const BANNER_DST = path.join(BANNER_DST_DIR, 'tv_banner.png');

function fail(msg) {
  console.error('[TV] 错误：' + msg);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) fail('找不到 AndroidManifest.xml，请先执行 npx cap add android');

let xml = fs.readFileSync(MANIFEST, 'utf-8');
const original = xml;

// 1. application 标签注入 android:banner
if (!xml.includes('android:banner=')) {
  xml = xml.replace(/<application\b/, '<application android:banner="@drawable/tv_banner"');
}

// 2. 注入 LEANBACK_LAUNCHER intent-filter（紧跟第一个 LAUNCHER intent-filter 之后）
if (!xml.includes('LEANBACK_LAUNCHER')) {
  const leanbackFilter = `
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>`;
  // 匹配包含 LAUNCHER 的第一个 intent-filter 整块
  const re = /(\s*<intent-filter>[\s\S]*?android\.intent\.category\.LAUNCHER[\s\S]*?<\/intent-filter>)/;
  if (re.test(xml)) {
    xml = xml.replace(re, '$1' + leanbackFilter);
  } else {
    fail('Manifest 中未找到 LAUNCHER intent-filter，Capacitor 模板可能已变更');
  }
}

// 3. 注入 uses-feature（手机/TV 兼容安装）
if (!xml.includes('android.software.leanback')) {
  const features = `
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
`;
  xml = xml.replace(/<application\b/, features + '    <application');
}

if (xml === original) {
  console.log('[TV] Manifest 已包含 TV 配置，跳过');
} else {
  fs.writeFileSync(MANIFEST, xml, 'utf-8');
  console.log('[TV] AndroidManifest.xml 已注入 TV 配置');
}

// 4. 复制横幅
fs.mkdirSync(BANNER_DST_DIR, { recursive: true });
if (!fs.existsSync(BANNER_SRC)) fail('找不到 icons/tv-banner-320x180.png，请先执行 npm run gen:icons');
fs.copyFileSync(BANNER_SRC, BANNER_DST);
console.log('[TV] 横幅已复制到 res/drawable-xhdpi/tv_banner.png');
console.log('[TV] 完成：此 APK 同时支持 Android 手机与 Android TV');
