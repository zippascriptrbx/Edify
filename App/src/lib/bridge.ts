import type { BootstrapInfo, DesktopAccountProvider, DesktopAccountUser, MediaAsset, ProjectDocument } from '../types/edify';
import type { AudioEditorBootstrap, AudioEditorProject } from '../types/audioEditor';
import type { StudioBootstrap, StudioProject } from '../types/studio';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function replaceOutputExtension(filePath: string, extension: string) {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex <= 0) return `${filePath}.${extension}`;
  return `${filePath.slice(0, dotIndex)}.${extension}`;
}

function parseResolution(value?: string) {
  const match = value?.match(/(\d+)\s*x\s*(\d+)/i);
  return {
    width: match ? Number(match[1]) : 1920,
    height: match ? Number(match[2]) : 1080
  };
}

function parseMbps(value?: string) {
  const parsed = Number.parseFloat(String(value ?? '16 Mbps').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

function pickBrowserVideoMime(format?: string) {
  const candidates =
    format === 'mp4'
      ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
  return {
    mimeType,
    extension: mimeType.includes('mp4') ? 'mp4' : 'webm'
  };
}

function drawBrowserExportFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  request: {
    projectName: string;
    resolution?: string;
    fps?: number;
    quality?: string;
    watermark?: boolean;
    project?: ProjectDocument;
  },
  progress: number
) {
  const tracks = request.project?.tracks ?? [];
  const clipCount = tracks.reduce((total, track) => total + track.clips.length, 0);
  context.clearRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#05060a');
  background.addColorStop(0.52, '#10182d');
  background.addColorStop(1, '#05060a');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.34 + Math.sin(progress * Math.PI * 2) * 0.05;
  context.fillStyle = '#1a6dff';
  context.fillRect(width * 0.14, height * 0.28, width * 0.14, height * 0.32);
  context.fillStyle = '#42e8ff';
  context.fillRect(width * 0.42, height * 0.22, width * 0.16, height * 0.38);
  context.fillStyle = '#8f6bff';
  context.beginPath();
  context.arc(width * 0.72, height * 0.27, height * 0.12, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.strokeStyle = 'rgba(65, 232, 255, 0.72)';
  context.lineWidth = Math.max(2, height * 0.004);
  context.strokeRect(width * 0.12, height * 0.16, width * 0.76, height * 0.58);
  context.shadowColor = 'rgba(65, 232, 255, 0.85)';
  context.shadowBlur = height * 0.03;
  context.fillStyle = '#f7ffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `900 ${Math.max(34, Math.round(height * 0.075))}px Inter, Segoe UI, sans-serif`;
  context.fillText(request.projectName.toUpperCase(), width / 2, height * 0.48, width * 0.82);
  context.shadowBlur = 0;
  context.fillStyle = '#aeb9ce';
  context.font = `700 ${Math.max(18, Math.round(height * 0.025))}px Inter, Segoe UI, sans-serif`;
  context.fillText(`${request.resolution ?? `${width} x ${height}`} - ${request.fps ?? 30}fps - ${tracks.length} tracks - ${clipCount} clips`, width / 2, height * 0.6, width * 0.82);

  context.fillStyle = '#42e8ff';
  context.fillRect(width * 0.08, height * 0.8, width * 0.84 * progress, Math.max(3, height * 0.006));
  if (request.watermark !== false) {
    context.textAlign = 'right';
    context.font = `800 ${Math.max(15, Math.round(height * 0.02))}px Inter, Segoe UI, sans-serif`;
    context.fillStyle = '#ffd85d';
    context.fillText('Made with Edify Free', width * 0.96, height * 0.93);
  }
}

function runBrowserVideoExport(fileName: string, request: {
  projectName: string;
  format?: string;
  resolution?: string;
  fps?: number;
  bitrate?: string;
  quality?: string;
  watermark?: boolean;
  project?: ProjectDocument;
}, onProgress: (progress: number) => void) {
  const { width, height } = parseResolution(request.resolution);
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(width, 1920);
  canvas.height = Math.min(height, 1080);
  const context = canvas.getContext('2d');
  const stream = canvas.captureStream(Math.max(1, Math.min(60, request.fps ?? 30)));
  const { mimeType } = pickBrowserVideoMime(request.format);
  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: parseMbps(request.bitrate) * 1_000_000
  };
  if (mimeType) recorderOptions.mimeType = mimeType;
  const recorder = new MediaRecorder(stream, recorderOptions);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  recorder.start(250);
  const durationMs = Math.min(Math.max(1, request.project?.duration ?? 8), 20) * 1000;
  const startedAt = performance.now();
  const render = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    if (context) drawBrowserExportFrame(context, canvas.width, canvas.height, request, progress);
    onProgress(Math.max(1, Math.round(progress * 100)));
    if (progress >= 1) {
      recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    window.requestAnimationFrame(render);
  };
  window.requestAnimationFrame(render);
}

function browserAssetFromFile(file: File): MediaAsset {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : undefined;
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const kind =
    mime.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/.test(name)
      ? 'video'
      : mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/.test(name)
        ? 'audio'
        : mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name)
          ? 'image'
          : 'unknown';

  return {
    id: `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    kind,
    path: `browser-file://${file.name}`,
    previewUrl: URL.createObjectURL(file),
    thumbnailUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
    size: file.size,
    extension,
    importedAt: new Date().toISOString(),
    duration: kind === 'image' ? 5 : undefined,
    dimensions: kind === 'image' || kind === 'video' ? { width: 1920, height: 1080 } : undefined
  };
}

type EdifyApi = {
  bootstrap: () => Promise<BootstrapInfo>;
  saveProject: (document: ProjectDocument, filePath?: string) => Promise<any>;
  saveProjectAs: (document: ProjectDocument) => Promise<any>;
  saveThumbnailPng: (payload: { fileName: string; buffer: ArrayBuffer }) => Promise<any>;
  openThumbnailAdvancedWindow: (project: ProjectDocument) => Promise<any>;
  getThumbnailAdvancedProject: () => Promise<ProjectDocument | null>;
  openEdifyStudioWindow: (project?: ProjectDocument | null) => Promise<any>;
  openAudioEditorWindow: () => Promise<any>;
  getEdifyStudioSeedProject: () => Promise<StudioProject | null>;
  getAudioEditorBootstrap: () => Promise<AudioEditorBootstrap>;
  saveAudioEditorProject: (document: AudioEditorProject, filePath?: string) => Promise<any>;
  saveAudioEditorProjectAs: (document: AudioEditorProject) => Promise<any>;
  openAudioEditorProjectDialog: () => Promise<any>;
  saveAudioEditorBinary: (payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) => Promise<any>;
  getStudioBootstrap: () => Promise<StudioBootstrap>;
  saveStudioProject: (document: StudioProject, filePath?: string) => Promise<any>;
  saveStudioProjectAs: (document: StudioProject) => Promise<any>;
  openStudioProjectDialog: () => Promise<any>;
  saveStudioBinary: (payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) => Promise<any>;
  openProjectDialog: () => Promise<any>;
  openProjectPath: (filePath: string) => Promise<any>;
  renameProject: (filePath: string, name: string) => Promise<any>;
  deleteProject: (filePath: string) => Promise<any>;
  importMedia: () => Promise<MediaAsset[]>;
  inspectDroppedFiles: (filePaths: string[]) => Promise<MediaAsset[]>;
  getPathForFile: (file: File) => string;
  saveRecording: (name: string, buffer: ArrayBuffer) => Promise<MediaAsset>;
  relinkMedia: () => Promise<any>;
  writeAutosave: (document: ProjectDocument) => Promise<any>;
  readAutosave: () => Promise<ProjectDocument | null>;
  clearAutosave: () => Promise<any>;
  setSetting: (key: string, value: unknown) => Promise<any>;
  acceptLaunchConsent: (mode: 'all' | 'essential') => Promise<any>;
  checkForUpdates: () => Promise<{ ok: boolean; status: string; version?: string; detail?: string }>;
  updateWindowState: (payload: {
    screen: 'home' | 'editor';
    saveStatus: string;
    project?: ProjectDocument | null;
  }) => void;
  openExternalUrl: (url: string) => Promise<any>;
  showItemInFolder: (filePath?: string) => Promise<any>;
  chooseExportPath: (request: { fileName: string; format?: string }) => Promise<any>;
  startExport: (request: {
    projectName: string;
    fileName?: string;
    preset?: string;
    outputPath?: string;
    format?: string;
    resolution?: string;
    fps?: number;
    bitrate?: string;
    quality?: string;
    codec?: string;
    audioCodec?: string;
    range?: string;
    includeAudio?: boolean;
    burnCaptions?: boolean;
    estimatedSizeMb?: number;
    watermark?: boolean;
    project?: ProjectDocument;
  }) => Promise<any>;
  cancelExport: (jobId: string) => Promise<any>;
  getDesktopAccount: () => Promise<DesktopAccountUser | null>;
  startDesktopOAuth: (provider: DesktopAccountProvider) => Promise<DesktopAccountUser>;
  signOutDesktopAccount: () => Promise<any>;
  windowMinimize: () => Promise<any>;
  windowClose: () => Promise<any>;
  closeCurrentWindow: () => Promise<any>;
  forceWindowClose: () => Promise<any>;
  onExportProgress: (callback: (event: unknown) => void) => () => void;
  onCloseRequest: (callback: () => void) => () => void;
};

const browserFallback: EdifyApi = {
  async bootstrap(): Promise<BootstrapInfo> {
    return {
      appVersion: 'browser-preview',
      platform: 'browser',
      paths: {
        projects: 'Documents/Edify Projects',
        cache: 'Edify Cache',
        userData: 'Browser localStorage',
        autosave: 'localStorage:edify-autosave'
      },
      settings: JSON.parse(localStorage.getItem('edify-settings') ?? 'null') ?? {
        uiScale: 1,
        previewQuality: 'Half',
        hardwareAcceleration: true,
        autosaveMinutes: 2
      },
      recentProjects: JSON.parse(localStorage.getItem('edify-recent') ?? '[]'),
      recoveryAvailable: Boolean(localStorage.getItem('edify-autosave')),
      consentAccepted: localStorage.getItem('edify-consent-accepted') === 'true'
    };
  },
  async saveProject(document: ProjectDocument, _filePath?: string) {
    localStorage.setItem('edify-demo-project', JSON.stringify(document));
    const recent = [
      {
        id: document.id,
        name: document.name,
        path: 'browser://edify-demo-project',
        updatedAt: new Date().toISOString(),
        thumbnail: document.thumbnail
      }
    ];
    localStorage.setItem('edify-recent', JSON.stringify(recent));
    return {
      canceled: false,
      filePath: 'browser://edify-demo-project',
      document: {
        ...document,
        path: 'browser://edify-demo-project',
        updatedAt: new Date().toISOString()
      }
    };
  },
  async saveProjectAs(document: ProjectDocument) {
    return this.saveProject(document);
  },
  async saveThumbnailPng(payload: { fileName: string; buffer: ArrayBuffer }) {
    const blob = new Blob([payload.buffer], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = payload.fileName || 'Edify Thumbnail.png';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { canceled: false, filePath: payload.fileName || 'Edify Thumbnail.png' };
  },
  async openThumbnailAdvancedWindow() {
    return { ok: false };
  },
  async getThumbnailAdvancedProject() {
    return null;
  },
  async openEdifyStudioWindow() {
    return { ok: false };
  },
  async openAudioEditorWindow() {
    return { ok: false };
  },
  async getEdifyStudioSeedProject() {
    return null;
  },
  async getAudioEditorBootstrap() {
    return {
      recentProjects: JSON.parse(localStorage.getItem('edify-audio-editor-recent') ?? '[]'),
      accountUser: null
    };
  },
  async saveAudioEditorProject(document: AudioEditorProject) {
    localStorage.setItem('edify-audio-editor-project', JSON.stringify(document));
    const recent = [{
      id: document.id,
      name: document.name,
      path: 'browser://edify-audio-editor-project',
      updatedAt: new Date().toISOString()
    }];
    localStorage.setItem('edify-audio-editor-recent', JSON.stringify(recent));
    return {
      canceled: false,
      filePath: 'browser://edify-audio-editor-project',
      document: {
        ...document,
        path: 'browser://edify-audio-editor-project',
        updatedAt: new Date().toISOString()
      }
    };
  },
  async saveAudioEditorProjectAs(document: AudioEditorProject) {
    return this.saveAudioEditorProject(document);
  },
  async openAudioEditorProjectDialog() {
    const raw = localStorage.getItem('edify-audio-editor-project');
    return raw
      ? { canceled: false, filePath: 'browser://edify-audio-editor-project', document: JSON.parse(raw) }
      : { canceled: true };
  },
  async saveAudioEditorBinary(payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) {
    const blob = new Blob([payload.buffer], { type: payload.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payload.suggestedName}.${payload.extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { canceled: false, filePath: link.download };
  },
  async getStudioBootstrap() {
    return {
      recentProjects: [],
      accountUser: null
    };
  },
  async saveStudioProject(document: StudioProject) {
    localStorage.setItem('edify-studio-project', JSON.stringify(document));
    const recent = [{
      id: document.id,
      name: document.name,
      path: 'browser://edify-studio-project',
      updatedAt: new Date().toISOString(),
      thumbnail: document.thumbnail
    }];
    localStorage.setItem('edify-studio-recent', JSON.stringify(recent));
    return {
      canceled: false,
      filePath: 'browser://edify-studio-project',
      document: {
        ...document,
        path: 'browser://edify-studio-project',
        updatedAt: new Date().toISOString()
      }
    };
  },
  async saveStudioProjectAs(document: StudioProject) {
    return this.saveStudioProject(document);
  },
  async openStudioProjectDialog() {
    const raw = localStorage.getItem('edify-studio-project');
    return raw
      ? { canceled: false, filePath: 'browser://edify-studio-project', document: JSON.parse(raw) }
      : { canceled: true };
  },
  async saveStudioBinary(payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) {
    const blob = new Blob([payload.buffer], { type: payload.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payload.suggestedName}.${payload.extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { canceled: false, filePath: link.download };
  },
  async openProjectDialog() {
    const raw = localStorage.getItem('edify-demo-project');
    return raw
      ? { canceled: false, filePath: 'browser://edify-demo-project', document: JSON.parse(raw) }
      : { canceled: true };
  },
  async openProjectPath() {
    const raw = localStorage.getItem('edify-demo-project');
    return raw
      ? { filePath: 'browser://edify-demo-project', document: JSON.parse(raw) }
      : Promise.reject(new Error('No browser project saved yet.'));
  },
  async renameProject(_filePath: string, name: string) {
    const raw = localStorage.getItem('edify-demo-project');
    if (!raw) return { filePath: 'browser://edify-demo-project', document: null, recentProjects: [] };
    const document = {
      ...JSON.parse(raw),
      name,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('edify-demo-project', JSON.stringify(document));
    const recent = [{ id: document.id, name, path: 'browser://edify-demo-project', updatedAt: document.updatedAt, thumbnail: document.thumbnail }];
    localStorage.setItem('edify-recent', JSON.stringify(recent));
    return { filePath: 'browser://edify-demo-project', document, recentProjects: recent };
  },
  async deleteProject(filePath: string) {
    if (filePath === 'browser://edify-demo-project') {
      localStorage.removeItem('edify-demo-project');
    }
    localStorage.setItem('edify-recent', JSON.stringify([]));
    return { ok: true, recentProjects: [] };
  },
  async importMedia() {
    return new Promise<MediaAsset[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*,image/*,.mp4,.mov,.mkv,.webm,.avi,.mp3,.wav,.m4a,.png,.jpg,.jpeg,.webp,.gif';
      input.onchange = () => resolve(Array.from(input.files ?? []).map(browserAssetFromFile));
      input.click();
    });
  },
  async inspectDroppedFiles() {
    return [];
  },
  getPathForFile(file: File) {
    return (file as File & { path?: string }).path ?? '';
  },
  async saveRecording(name: string, buffer: ArrayBuffer) {
    const blob = new Blob([buffer], { type: 'audio/webm' });
    return {
      id: `recording-${Date.now()}`,
      name: `${name}.webm`,
      kind: 'audio',
      path: `browser-recording://${name}`,
      previewUrl: URL.createObjectURL(blob),
      size: buffer.byteLength,
      extension: 'WEBM',
      importedAt: new Date().toISOString(),
      duration: 8
    };
  },
  async relinkMedia() {
    return { canceled: true };
  },
  async writeAutosave(document: ProjectDocument) {
    localStorage.setItem('edify-autosave', JSON.stringify(document));
    return { ok: true };
  },
  async readAutosave() {
    const raw = localStorage.getItem('edify-autosave');
    return raw ? JSON.parse(raw) : null;
  },
  async clearAutosave() {
    localStorage.removeItem('edify-autosave');
    return { ok: true };
  },
  async setSetting(key: string, value: unknown) {
    const info = await this.bootstrap();
    const settings = { ...info.settings, [key]: value };
    localStorage.setItem('edify-settings', JSON.stringify(settings));
    return settings;
  },
  async acceptLaunchConsent(_mode: 'all' | 'essential') {
    localStorage.setItem('edify-consent-accepted', 'true');
    return { ok: true };
  },
  async checkForUpdates() {
    return { ok: true, status: 'browser-preview', detail: 'Auto updates are available in the packaged desktop app.' };
  },
  updateWindowState() {
    return;
  },
  async openExternalUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true, url };
  },
  async showItemInFolder(filePath?: string) {
    if (filePath) {
      console.info('Browser preview export location:', filePath);
    }
    return { ok: true };
  },
  async chooseExportPath(request: { fileName: string; format?: string }) {
    return { canceled: false, filePath: request.fileName };
  },
  async startExport(request: {
    projectName: string;
    fileName?: string;
    preset?: string;
    outputPath?: string;
    format?: string;
    resolution?: string;
    fps?: number;
    bitrate?: string;
    quality?: string;
    codec?: string;
    audioCodec?: string;
    range?: string;
    includeAudio?: boolean;
    burnCaptions?: boolean;
    estimatedSizeMb?: number;
    watermark?: boolean;
    project?: ProjectDocument;
  }) {
    const extension = request.format ?? 'mp4';
    const requestedOutput = request.outputPath || request.fileName || `${request.projectName}.${extension}`;
    const { extension: actualExtension } = pickBrowserVideoMime(request.format);
    const outputPath = replaceOutputExtension(requestedOutput, actualExtension);
    const jobId = `browser-export-${Date.now()}`;
    window.setTimeout(() => {
      runBrowserVideoExport(outputPath.split(/[\\/]/).pop() ?? outputPath, request, (progress) => {
        window.dispatchEvent(
          new CustomEvent('edify-browser-export-progress', {
            detail: {
              jobId,
              progress,
              outputPath,
              state: progress >= 100 ? 'complete' : 'rendering'
            }
          })
        );
      });
    }, 10);
    return { canceled: false, jobId, outputPath };
  },
  async cancelExport() {
    return { ok: true };
  },
  async getDesktopAccount() {
    return null;
  },
  async startDesktopOAuth() {
    throw new Error('Desktop sign-in is only available inside the Edify desktop app.');
  },
  async signOutDesktopAccount() {
    return { ok: true };
  },
  async windowMinimize() {
    return { ok: true };
  },
  async windowClose() {
    window.close();
    return { ok: true };
  },
  async closeCurrentWindow() {
    window.close();
    return { ok: true };
  },
  async forceWindowClose() {
    window.close();
    return { ok: true };
  },
  onExportProgress(callback: (payload: unknown) => void) {
    const listener = (event: Event) => callback((event as CustomEvent).detail);
    window.addEventListener('edify-browser-export-progress', listener);
    return () => window.removeEventListener('edify-browser-export-progress', listener);
  },
  onCloseRequest() {
    return () => undefined;
  }
};

export const edifyApi: EdifyApi = window.edify ?? browserFallback;
