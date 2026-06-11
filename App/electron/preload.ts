import { contextBridge, ipcRenderer, webUtils } from 'electron';

const edify = {
  bootstrap: () => ipcRenderer.invoke('edify:bootstrap'),
  saveProject: (document: unknown, filePath?: string) =>
    ipcRenderer.invoke('edify:saveProject', { document, filePath }),
  saveProjectAs: (document: unknown) => ipcRenderer.invoke('edify:saveProjectAs', document),
  saveThumbnailPng: (payload: { fileName: string; buffer: ArrayBuffer }) => ipcRenderer.invoke('edify:saveThumbnailPng', payload),
  openThumbnailAdvancedWindow: (project: unknown) => ipcRenderer.invoke('edify:openThumbnailAdvancedWindow', project),
  getThumbnailAdvancedProject: () => ipcRenderer.invoke('edify:getThumbnailAdvancedProject'),
  openEdifyStudioWindow: (project?: unknown) => ipcRenderer.invoke('edify:openEdifyStudioWindow', project),
  openAudioEditorWindow: () => ipcRenderer.invoke('edify:openAudioEditorWindow'),
  getEdifyStudioSeedProject: () => ipcRenderer.invoke('edify:getEdifyStudioSeedProject'),
  getAudioEditorBootstrap: () => ipcRenderer.invoke('edify:getAudioEditorBootstrap'),
  saveAudioEditorProject: (document: unknown, filePath?: string) => ipcRenderer.invoke('edify:saveAudioEditorProject', { document, filePath }),
  saveAudioEditorProjectAs: (document: unknown) => ipcRenderer.invoke('edify:saveAudioEditorProjectAs', document),
  openAudioEditorProjectDialog: () => ipcRenderer.invoke('edify:openAudioEditorProjectDialog'),
  saveAudioEditorBinary: (payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) => ipcRenderer.invoke('edify:saveAudioEditorBinary', payload),
  getStudioBootstrap: () => ipcRenderer.invoke('edify:getStudioBootstrap'),
  saveStudioProject: (document: unknown, filePath?: string) => ipcRenderer.invoke('edify:saveStudioProject', { document, filePath }),
  saveStudioProjectAs: (document: unknown) => ipcRenderer.invoke('edify:saveStudioProjectAs', document),
  openStudioProjectDialog: () => ipcRenderer.invoke('edify:openStudioProjectDialog'),
  saveStudioBinary: (payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) => ipcRenderer.invoke('edify:saveStudioBinary', payload),
  openProjectDialog: () => ipcRenderer.invoke('edify:openProjectDialog'),
  openProjectPath: (filePath: string) => ipcRenderer.invoke('edify:openProjectPath', filePath),
  renameProject: (filePath: string, name: string) => ipcRenderer.invoke('edify:renameProject', { filePath, name }),
  deleteProject: (filePath: string) => ipcRenderer.invoke('edify:deleteProject', filePath),
  importMedia: () => ipcRenderer.invoke('edify:importMedia'),
  inspectDroppedFiles: (filePaths: string[]) => ipcRenderer.invoke('edify:inspectDroppedFiles', filePaths),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  saveRecording: (name: string, buffer: ArrayBuffer) => ipcRenderer.invoke('edify:saveRecording', { name, buffer }),
  relinkMedia: () => ipcRenderer.invoke('edify:relinkMedia'),
  writeAutosave: (document: unknown) => ipcRenderer.invoke('edify:writeAutosave', document),
  readAutosave: () => ipcRenderer.invoke('edify:readAutosave'),
  clearAutosave: () => ipcRenderer.invoke('edify:clearAutosave'),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('edify:setSetting', key, value),
  acceptLaunchConsent: (mode: 'all' | 'essential') => ipcRenderer.invoke('edify:acceptLaunchConsent', mode),
  checkForUpdates: () => ipcRenderer.invoke('edify:checkForUpdates'),
  updateWindowState: (payload: unknown) => ipcRenderer.send('edify:updateWindowState', payload),
  openExternalUrl: (url: string) => ipcRenderer.invoke('edify:openExternalUrl', url),
  showItemInFolder: (filePath?: string) => ipcRenderer.invoke('edify:showItemInFolder', filePath),
  chooseExportPath: (request: unknown) => ipcRenderer.invoke('edify:chooseExportPath', request),
  startExport: (request: unknown) => ipcRenderer.invoke('edify:startExport', request),
  cancelExport: (jobId: string) => ipcRenderer.invoke('edify:cancelExport', jobId),
  getDesktopAccount: () => ipcRenderer.invoke('edify:getDesktopAccount'),
  startDesktopOAuth: (provider: 'google' | 'github' | 'microsoft') => ipcRenderer.invoke('edify:startDesktopOAuth', provider),
  signOutDesktopAccount: () => ipcRenderer.invoke('edify:signOutDesktopAccount'),
  windowMinimize: () => ipcRenderer.invoke('edify:windowMinimize'),
  windowClose: () => ipcRenderer.invoke('edify:windowClose'),
  closeCurrentWindow: () => ipcRenderer.invoke('edify:closeCurrentWindow'),
  forceWindowClose: () => ipcRenderer.invoke('edify:forceWindowClose'),
  onExportProgress: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on('edify:exportProgress', listener);
    return () => ipcRenderer.removeListener('edify:exportProgress', listener);
  },
  onCloseRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('edify:requestClose', listener);
    return () => ipcRenderer.removeListener('edify:requestClose', listener);
  }
};

contextBridge.exposeInMainWorld('edify', edify);

export type EdifyBridge = typeof edify;
