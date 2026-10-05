const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atomicTodo", {
  quit: () => ipcRenderer.send("window:quit"),
  setLocked: (locked) => ipcRenderer.send("window:set-locked", Boolean(locked)),
  setCompact: (compact) => ipcRenderer.send("window:set-compact", Boolean(compact)),
  setUltraCompact: (ultraCompact) => ipcRenderer.send("window:set-ultra", Boolean(ultraCompact)),
  startUltraDrag: (screenX, screenY) => ipcRenderer.send("window:ultra-drag-start", { screenX, screenY }),
  moveUltraDrag: (screenX, screenY) => ipcRenderer.send("window:ultra-drag-move", { screenX, screenY }),
  endUltraDrag: () => ipcRenderer.send("window:ultra-drag-end"),
  fitContent: (height) => ipcRenderer.send("window:fit-content", Number(height)),
  getWindowState: () => ipcRenderer.invoke("window:get-state"),
  onClockRefresh: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("clock:refresh", listener);
    return () => ipcRenderer.removeListener("clock:refresh", listener);
  },
  notify: (title, body) => ipcRenderer.invoke("notification:show", { title, body }),
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-app");
});
