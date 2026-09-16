// Sandboxed Electron preloads must use the limited CommonJS require.
// oxlint-disable-next-line typescript/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'qc',
  Object.freeze({
    session: () => ipcRenderer.invoke('qc:session'),
    login: () => ipcRenderer.invoke('qc:login'),
    logout: () => ipcRenderer.invoke('qc:logout'),
    projects: () => ipcRenderer.invoke('qc:projects'),
    createProject: (input) => ipcRenderer.invoke('qc:createProject', input),
    instructions: (input) => ipcRenderer.invoke('qc:instructions', input),
    choose: () => ipcRenderer.invoke('qc:choose'),
    cloudSources: (input) => ipcRenderer.invoke('qc:cloudSources', input),
    importSource: (input) => ipcRenderer.invoke('qc:importSource', input),
    review: (input) => ipcRenderer.invoke('qc:review', input),
    cancel: () => ipcRenderer.invoke('qc:cancel'),
    export: () => ipcRenderer.invoke('qc:export'),
    onAuthenticated: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('qc:authenticated', listener);
      return () => ipcRenderer.removeListener('qc:authenticated', listener);
    },
    onProgress: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('qc:progress', listener);
      return () => ipcRenderer.removeListener('qc:progress', listener);
    },
  }),
);
