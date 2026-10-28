'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miso', Object.freeze({
  getState: () => ipcRenderer.invoke('state:get'),
  update: (patch) => ipcRenderer.invoke('settings:update', patch),
  action: (action) => ipcRenderer.invoke('pet:action', action),
  drag: (phase) => ipcRenderer.send('pet:drag', phase),
  dragFrame: () => ipcRenderer.invoke('pet:drag-frame'),
  menu: () => ipcRenderer.send('pet:menu'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
}));
