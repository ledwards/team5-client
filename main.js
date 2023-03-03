const { app, BrowserWindow, Menu, session } = require('electron')

const path = require('path')

let window;
let menu;

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

if (isWin) { // required to prevent crash, at least in Parallels
  app.commandLine.appendSwitch('in-process-gpu');
}

function createMenu() {
  const template = [
    // { role: 'appMenu' }
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
      ]
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://electronjs.org')
          }
        }
      ]
    }
  ]

  menu = Menu.buildFromTemplate(template) // sets the menu
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  window = new BrowserWindow({
    width: 1920,
    height: 1080,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'assets/icons/png/64x64.png'),
    webPreferences: {
      devTools: true,
      plugins: true,
      nodeIntegration: true
      // preload: path.join(__dirname, "preloader.js")
    }
  });

  window.loadURL('https://gemp.starwarsccg.org/gemp-swccg/');

  //garbage collection handle
  window.on('close', () => {
    window = null;
  });
}

function loadExtension() {
  const extensionPath = path.join(app.getAppPath(), "extensions/gemp/dist");
  app.whenReady().then(async () => {
    await session.defaultSession.loadExtension(extensionPath);
    // chrome.runtime.sendMessage('openOptions');
  })
}

function init() {
  createMenu();
  createWindow();
  loadExtension();
}

app.on('ready', init)
