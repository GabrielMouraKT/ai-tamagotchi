'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Superfície mínima exposta à interface: ações de janela (lista fechada no main) e o estado do acoplamento.
contextBridge.exposeInMainWorld('desktop', {
  action: (name, arg) => ipcRenderer.invoke('window-action', name, arg),
  getState: () => ipcRenderer.invoke('get-state'),
  connect: mode => ipcRenderer.invoke('connect-claude', mode === 'remove' ? 'remove' : 'install'),
  onState: cb => { ipcRenderer.on('desktop-state', (_e, value) => cb(value)); },
});
