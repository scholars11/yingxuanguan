/*
 * electron-main.js - 影序馆桌面版主进程
 * 软件启动时在后台运行内置服务（server.js，随机本地端口），
 * 主窗口直接加载该服务；关闭软件即停止服务。
 */

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const SMOKE_MODE = process.argv.includes('--smoke');
let mainWindow = null;
let httpServer = null;

// 单实例：重复打开时聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(start);
}

async function start() {
  // 启动内置本地服务（端口 0 = 系统随机分配，避免冲突）
  const { startServer } = require('./server.js');
  httpServer = await startServer(0, '127.0.0.1');
  const port = httpServer.address().port;
  const appUrl = 'http://127.0.0.1:' + port + '/';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: '影序馆',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icons', 'icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // 去掉默认菜单栏，更接近原生软件
  Menu.setApplicationMenu(null);

  // 外部链接交给系统浏览器，不在应用内开新窗
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  await mainWindow.loadURL(appUrl);

  if (SMOKE_MODE) {
    // 自动化冒烟验证：页面加载成功后停留片刻即正常退出
    setTimeout(() => app.quit(), 1500);
  }
}

// 所有窗口关闭即退出（后台服务随之结束）
app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (httpServer) {
    try { httpServer.close(); } catch (e) {}
    httpServer = null;
  }
});
