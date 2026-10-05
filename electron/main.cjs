const { app, BrowserWindow, ipcMain, Notification, screen, powerMonitor } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WIDTH = 410;
const DEFAULT_HEIGHT = 690;
const COMPACT_WIDTH = 350;
const ULTRA_SIZE = 76;
const APP_ICON = path.join(__dirname, "..", "build", "icon.png");
let mainWindow;
let saveTimer;
let ultraCompact = false;
let ultraDrag = null;

function settingsPath() {
  return path.join(app.getPath("userData"), "window-settings.json");
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
  } catch {}
}

function targetDisplay(savedDisplayId) {
  const displays = screen.getAllDisplays();
  return displays.find((display) => String(display.id) === String(savedDisplayId))
    ?? displays.find((display) => !display.bounds || display.id !== screen.getPrimaryDisplay().id)
    ?? screen.getPrimaryDisplay();
}

function clampBounds(bounds, display) {
  const area = display.workArea;
  const width = Math.min(Math.max(bounds.width ?? DEFAULT_WIDTH, 330), area.width);
  const height = Math.min(Math.max(bounds.height ?? DEFAULT_HEIGHT, 420), area.height);
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x ?? area.x + area.width - width - 24, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y ?? area.y + 24, area.y), area.y + area.height - height),
  };
}

function initialBounds(settings) {
  const display = targetDisplay(settings.displayId);
  return clampBounds(settings.bounds ?? {}, display);
}

function persistWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    writeSettings({ bounds, displayId: display.id, locked: !mainWindow.isMovable() });
  }, 250);
}

function createWindow() {
  const settings = readSettings();
  const bounds = initialBounds(settings);
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 330,
    minHeight: 420,
    maxWidth: 460,
    frame: false,
    icon: APP_ICON,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    resizable: false,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMovable(settings.locked !== true);
  mainWindow.loadFile(path.join(__dirname, "..", "prototype", "index.html"));
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Renderer failed to load (${code}): ${description}`);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (!process.env.ATOMIC_TODO_CAPTURE) return;
    setTimeout(async () => {
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.resolve(process.env.ATOMIC_TODO_CAPTURE), image.toPNG());
      console.log(`Captured ${process.env.ATOMIC_TODO_CAPTURE}`);
    }, 700);
  });
  mainWindow.on("move", persistWindow);
  mainWindow.on("focus", refreshClock);
  mainWindow.on("show", refreshClock);
  mainWindow.on("restore", refreshClock);
  mainWindow.on("resize", persistWindow);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function refreshClock() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("clock:refresh");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    powerMonitor.on("resume", refreshClock);
    powerMonitor.on("unlock-screen", refreshClock);
    app.setName("原子代办");
    app.setAppUserModelId("io.github.gaoyq0731.atomictodo");
    createWindow();
  });
}

ipcMain.on("window:quit", () => app.quit());

ipcMain.on("window:set-locked", (_event, locked) => {
  if (!mainWindow) return;
  mainWindow.setMovable(!locked);
  persistWindow();
});

ipcMain.on("window:set-compact", (_event, compact) => {
  if (!mainWindow || ultraCompact) return;
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  const desired = clampBounds({ ...current, width: compact ? COMPACT_WIDTH : DEFAULT_WIDTH }, display);
  mainWindow.setBounds(desired, true);
});

ipcMain.on("window:set-ultra", (_event, enabled) => {
  if (!mainWindow) return;
  ultraCompact = enabled;
  ultraDrag = null;
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  if (enabled) {
    mainWindow.setMinimumSize(ULTRA_SIZE, ULTRA_SIZE);
    mainWindow.setBounds({ ...current, width: ULTRA_SIZE, height: ULTRA_SIZE }, true);
  } else {
    mainWindow.setMinimumSize(330, 420);
    const desired = clampBounds({ ...current, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, display);
    mainWindow.setBounds(desired, true);
  }
});

ipcMain.on("window:ultra-drag-start", (_event, point) => {
  if (!mainWindow || !ultraCompact || !Number.isFinite(point?.screenX) || !Number.isFinite(point?.screenY)) return;
  ultraDrag = {
    screenX: point.screenX,
    screenY: point.screenY,
    bounds: mainWindow.getBounds(),
  };
});

ipcMain.on("window:ultra-drag-move", (_event, point) => {
  if (!mainWindow || !ultraCompact || !ultraDrag || !Number.isFinite(point?.screenX) || !Number.isFinite(point?.screenY)) return;
  const x = Math.round(ultraDrag.bounds.x + point.screenX - ultraDrag.screenX);
  const y = Math.round(ultraDrag.bounds.y + point.screenY - ultraDrag.screenY);
  const display = screen.getDisplayNearestPoint({ x: Math.round(point.screenX), y: Math.round(point.screenY) });
  const area = display.workArea;
  const clampedX = Math.min(Math.max(x, area.x), area.x + area.width - ULTRA_SIZE);
  const clampedY = Math.min(Math.max(y, area.y), area.y + area.height - ULTRA_SIZE);
  mainWindow.setPosition(clampedX, clampedY, false);
  persistWindow();
});

ipcMain.on("window:ultra-drag-end", () => {
  ultraDrag = null;
});

ipcMain.handle("window:get-state", () => ({
  locked: mainWindow ? !mainWindow.isMovable() : false,
}));

ipcMain.on("window:fit-content", (_event, requestedHeight) => {
  if (!mainWindow || ultraCompact || !Number.isFinite(requestedHeight)) return;
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  const height = Math.min(Math.max(Math.ceil(requestedHeight), 420), display.workArea.height);
  const desired = clampBounds({ ...current, height }, display);
  mainWindow.setBounds(desired, false);
});

ipcMain.handle("notification:show", (_event, { title, body }) => {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({ title, body, icon: APP_ICON, urgency: "normal", timeoutType: "default" });
  notification.on("click", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
  return true;
});

app.on("window-all-closed", () => app.quit());
