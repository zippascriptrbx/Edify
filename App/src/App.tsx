import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, AudioLines, ImagePlus, Rocket, Settings2, X } from 'lucide-react';
import { AudioEditorWindow } from './components/audio/AudioEditorWindow';
import { EditorShell } from './components/EditorShell';
import { HomeScreen } from './components/home/HomeScreen';
import { CommandPalette, type CommandAction } from './components/modals/CommandPalette';
import { AccountModal } from './components/modals/AccountModal';
import { ExportModal } from './components/modals/ExportModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ShortcutModal } from './components/modals/ShortcutModal';
import { ThumbnailStudioModal } from './components/modals/ThumbnailStudioModal';
import { EdifyStudioWindow } from './components/studio/EdifyStudioWindow';
import { ToastStack } from './components/ToastStack';
import { edifyApi } from './lib/bridge';
import { createId } from './lib/id';
import { createDemoProject } from './state/demoProject';
import { useEditorState } from './state/useEditorState';
import type { BootstrapInfo, DesktopAccountProvider, DesktopAccountUser, MediaAsset, PanelId, ProjectDocument, ProjectSummary, Toast } from './types/edify';

type Screen = 'home' | 'editor';

type ForcedUpdateState = {
  visible: boolean;
  phase: 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
  percent: number;
  version?: string;
  detail?: string;
};

const autosaveIntervalMs = 1000 * 45;

function browserAssetFromFile(file: File): MediaAsset {
  const lowerName = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  const kind =
    mime.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/.test(lowerName)
      ? 'video'
      : mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/.test(lowerName)
        ? 'audio'
        : mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(lowerName)
          ? 'image'
          : 'unknown';

  return {
    id: createId('asset'),
    name: file.name,
    kind,
    path: `browser-file://${file.name}`,
    previewUrl: URL.createObjectURL(file),
    thumbnailUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
    size: file.size,
    extension: file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : undefined,
    importedAt: new Date().toISOString(),
    duration: kind === 'image' ? 5 : undefined,
    dimensions: kind === 'image' || kind === 'video' ? { width: 1920, height: 1080 } : undefined
  };
}

async function enrichImportedAsset(asset: MediaAsset): Promise<MediaAsset> {
  if (asset.kind === 'video' || asset.kind === 'audio') {
    return readMediaMetadata(asset);
  }
  if (asset.kind === 'image') {
    return readImageMetadata(asset);
  }
  return asset;
}

async function buildRealWaveform(previewUrl: string, bars = 120): Promise<number[] | undefined> {
  try {
    const response = await fetch(previewUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(channelData.length / bars));
      const values = Array.from({ length: bars }, (_, index) => {
        const start = index * blockSize;
        const end = Math.min(channelData.length, start + blockSize);
        let peak = 0;
        for (let sample = start; sample < end; sample += 1) {
          peak = Math.max(peak, Math.abs(channelData[sample] ?? 0));
        }
        return Math.round(Math.min(100, peak * 100));
      });
      return values.some((value) => value > 0) ? values : undefined;
    } finally {
      void audioContext.close();
    }
  } catch {
    return undefined;
  }
}

function readMediaMetadata(asset: MediaAsset): Promise<MediaAsset> {
  if (!asset.previewUrl) return Promise.resolve(asset);
  const previewUrl = asset.previewUrl;

  return new Promise((resolve) => {
    const media = document.createElement(asset.kind === 'audio' ? 'audio' : 'video');
    let settled = false;
    const finish = (nextAsset: MediaAsset) => {
      if (settled) return;
      settled = true;
      media.onloadedmetadata = null;
      media.onerror = null;
      window.clearTimeout(timeout);
      resolve(nextAsset);
    };
    const timeout = window.setTimeout(() => finish(asset), 5000);

    media.preload = 'metadata';
    media.onloadedmetadata = async () => {
      const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : asset.duration;
      const dimensions =
        asset.kind === 'video' && media instanceof HTMLVideoElement && media.videoWidth > 0 && media.videoHeight > 0
          ? { width: media.videoWidth, height: media.videoHeight }
          : asset.dimensions;
      const waveform = asset.kind === 'audio' ? await buildRealWaveform(previewUrl) : asset.waveform;
      finish({
        ...asset,
        duration,
        dimensions,
        waveform
      });
    };
    media.onerror = () => finish(asset);
    media.src = previewUrl;
  });
}

function readImageMetadata(asset: MediaAsset): Promise<MediaAsset> {
  if (!asset.previewUrl) return Promise.resolve(asset);
  const previewUrl = asset.previewUrl;

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (nextAsset: MediaAsset) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      window.clearTimeout(timeout);
      resolve(nextAsset);
    };
    const timeout = window.setTimeout(() => finish(asset), 2500);
    image.onload = () => {
      finish({
        ...asset,
        duration: asset.duration ?? 5,
        dimensions: image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : asset.dimensions
      });
    };
    image.onerror = () => finish(asset);
    image.src = previewUrl;
  });
}

export default function App() {
  if (typeof window !== 'undefined') {
    const windowMode = new URLSearchParams(window.location.search).get('window');
    if (windowMode === 'studio-editor') {
      return <EdifyStudioWindow />;
    }
    if (windowMode === 'audio-editor') {
      return <AudioEditorWindow />;
    }
  }

  const [screen, setScreen] = useState<Screen>('home');
  const [bootstrap, setBootstrap] = useState<BootstrapInfo | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showThumbnailStudio, setShowThumbnailStudio] = useState(false);
  const [accountUser, setAccountUser] = useState<DesktopAccountUser | null>(null);
  const [accountBusyProvider, setAccountBusyProvider] = useState<DesktopAccountProvider | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | undefined>(undefined);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [forcedUpdate, setForcedUpdate] = useState<ForcedUpdateState | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  const editor = useEditorState(useMemo(() => createDemoProject('Edify Demo Reel'), []));

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = createId('toast');
    setToasts((current) => [...current, { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const info = await edifyApi.bootstrap();
    setBootstrap(info);
    setRecentProjects(info.recentProjects);
    setShowRecovery(info.recoveryAvailable);
    setShowConsent(!info.consentAccepted);
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    if (!bootstrap || showConsent) return;
    const key = `edify-whats-new-${bootstrap.appVersion ?? '0.1.6'}`;
    if (window.localStorage.getItem(key) !== 'seen') {
      setShowWhatsNew(true);
    }
  }, [bootstrap, showConsent]);

  const dismissWhatsNew = useCallback(() => {
    if (bootstrap) {
      window.localStorage.setItem(`edify-whats-new-${bootstrap.appVersion ?? '0.1.6'}`, 'seen');
    }
    setShowWhatsNew(false);
  }, [bootstrap]);

  useEffect(() => {
    void edifyApi.getDesktopAccount()
      .then((user) => {
        setAccountUser(user ?? null);
      })
      .catch(() => {
        setAccountUser(null);
      });
  }, []);

  useEffect(() => {
    return edifyApi.onCloseRequest(() => {
      setShowClosePrompt(true);
    });
  }, []);

  useEffect(() => {
    return edifyApi.onExportProgress((payload: unknown) => {
      const next = payload as { type?: string; phase?: ForcedUpdateState['phase'] | 'idle'; percent?: number; version?: string; detail?: string };
      if (next.type !== 'app-update' || !next.phase) return;
      if (next.phase === 'idle') {
        setForcedUpdate(null);
        pushToast({ title: 'Edify is up to date', detail: next.detail ?? 'No update is required right now.', tone: 'success' });
        return;
      }
      setForcedUpdate({
        visible: true,
        phase: next.phase,
        percent: typeof next.percent === 'number' ? next.percent : next.phase === 'downloaded' || next.phase === 'installing' ? 100 : 0,
        version: next.version,
        detail: next.detail
      });
    });
  }, [pushToast]);

  useEffect(() => {
    if (screen !== 'editor' || editor.saveStatus === 'saved') return;
    const timer = window.setInterval(() => {
      void edifyApi.writeAutosave(editor.project).then(() => editor.setSaveStatus('autosaved'));
    }, autosaveIntervalMs);
    return () => window.clearInterval(timer);
  }, [editor, editor.project, editor.saveStatus, editor.setSaveStatus, screen]);

  useEffect(() => {
    if (!editor.isPlaying) return;
    const startTime = performance.now();
    const startPlayhead = editor.playhead;
    let frame = 0;

    const tick = (now: number) => {
      const nextPlayhead = startPlayhead + (now - startTime) / 1000;
      if (nextPlayhead >= editor.project.duration) {
        editor.setPlayhead(0);
        editor.setPlaying(false);
        return;
      }
      editor.setPlayhead(nextPlayhead);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [editor.isPlaying]);

  useEffect(() => {
    edifyApi.updateWindowState({
      screen,
      saveStatus: editor.saveStatus,
      project: screen === 'editor' ? editor.project : null
    });
  }, [editor.project, editor.saveStatus, screen]);

  const saveProject = useCallback(async (saveAs = false) => {
    editor.setSaveStatus('saving');
    const result = saveAs
      ? await edifyApi.saveProjectAs(editor.project)
      : await edifyApi.saveProject(editor.project, editor.project.path);
    if (!result?.canceled && result.document) {
      editor.setProject(result.document as ProjectDocument, 'saved');
      await refreshBootstrap();
      pushToast({
        title: 'Project saved',
        detail: result.cloudSynced ? 'Saved locally and synced to your Edify account.' : result.filePath,
        tone: 'success'
      });
    } else {
      editor.setSaveStatus('dirty');
    }
    return result;
  }, [editor, pushToast, refreshBootstrap]);

  const openProjectDialog = useCallback(async () => {
    const result = await edifyApi.openProjectDialog();
    if (!result?.canceled && result.document) {
      editor.setProject(result.document as ProjectDocument, 'saved');
      setScreen('editor');
      await refreshBootstrap();
      pushToast({ title: 'Project opened', detail: (result.document as ProjectDocument).name, tone: 'success' });
    }
  }, [editor, pushToast, refreshBootstrap]);

  const openProjectPath = useCallback(async (projectPath: string) => {
    const result = await edifyApi.openProjectPath(projectPath);
    editor.setProject(result.document as ProjectDocument, 'saved');
    setScreen('editor');
    await refreshBootstrap();
  }, [editor, refreshBootstrap]);

  const importMedia = useCallback(async () => {
    const importedAssets = (await edifyApi.importMedia()) as MediaAsset[];
    const assets = await Promise.all(importedAssets.map(enrichImportedAsset));
    if (assets.length > 0) {
      editor.addAssets(assets);
      setScreen('editor');
      pushToast({ title: 'Media imported', detail: `${assets.length} file${assets.length > 1 ? 's' : ''} added`, tone: 'success' });
    }
  }, [editor, pushToast]);

  const inspectDroppedFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const paths = fileArray
      .map((file) => (file as File & { path?: string }).path || edifyApi.getPathForFile?.(file) || '')
      .filter(Boolean) as string[];
    if (paths.length === 0) {
      const browserAssets = await Promise.all(fileArray.map(browserAssetFromFile).map(enrichImportedAsset));
      if (browserAssets.length > 0) {
        editor.addAssets(browserAssets);
        setScreen('editor');
        pushToast({ title: 'Drop accepted', detail: `${browserAssets.length} browser asset${browserAssets.length > 1 ? 's' : ''} ready`, tone: 'success' });
        return;
      }
      pushToast({ title: 'Drop blocked', detail: 'Edify could not read those files. Use Import as a fallback.', tone: 'warning' });
      return;
    }
    const inspectedAssets = (await edifyApi.inspectDroppedFiles(paths)) as MediaAsset[];
    const assets = await Promise.all(inspectedAssets.map(enrichImportedAsset));
    editor.addAssets(assets);
    setScreen('editor');
    pushToast({ title: 'Drop accepted', detail: `${assets.length} asset${assets.length > 1 ? 's' : ''} ready`, tone: 'success' });
  }, [editor, pushToast]);

  const createNewProject = useCallback((name = 'Untitled Edit') => {
    editor.setProject(createDemoProject(name), 'dirty');
    setScreen('editor');
  }, [editor]);

  const openPremiumStudio = useCallback(() => {
    editor.setActivePanel('premium');
    setScreen('editor');
    pushToast({ title: 'Premium Studio', detail: 'Choose a plan or open the hidden code field below the plans.', tone: 'info' });
  }, [editor, pushToast]);

  const openPanel = useCallback((panel: PanelId) => {
    editor.setActivePanel(panel);
    setScreen('editor');
  }, [editor]);

  const openThumbnailStudio = useCallback(() => {
    setShowThumbnailStudio(true);
  }, []);

  const openEdifyStudio = useCallback(async () => {
    await edifyApi.openEdifyStudioWindow(editor.project);
    pushToast({
      title: 'Thumbnail Studio opened',
      detail: 'The professional thumbnail editor is now open in its own workspace window.',
      tone: 'success'
    });
  }, [editor.project, pushToast]);

  const openAudioEditor = useCallback(async () => {
    await edifyApi.openAudioEditorWindow();
    pushToast({
      title: 'Audio Editor opened',
      detail: 'The new audio workspace is now open in its own dedicated window.',
      tone: 'success'
    });
  }, [pushToast]);

  const commandActions = useMemo<CommandAction[]>(() => [
    { id: 'new', label: 'New Project', detail: 'Create a fresh Edify project', shortcut: 'Ctrl+N', run: () => createNewProject('Untitled Edit') },
    { id: 'import', label: 'Import Media', detail: 'Add videos, images, or audio from Windows', shortcut: 'Ctrl+I', run: importMedia },
    { id: 'save', label: 'Save Project', detail: 'Write the current project locally', shortcut: 'Ctrl+S', run: () => void saveProject(false) },
    { id: 'export', label: 'Export Video', detail: 'Open render settings, quality, and output file name', shortcut: 'Ctrl+E', run: () => setShowExport(true) },
    { id: 'quick', label: 'Quick Edit Mode', detail: 'One-click cinematic, gaming, montage, and creator recipes', run: () => openPanel('quick') },
    { id: 'ai', label: 'AI Lab', detail: 'Auto subtitles, beat helper, voice enhance, and blur tools', run: () => openPanel('ai') },
    { id: 'sounds', label: 'Sound Library', detail: 'Place impacts, risers, whooshes, and ambience', run: () => openPanel('sounds') },
    { id: 'marketplace', label: 'Marketplace', detail: 'Browse free and premium creative packs', run: () => openPanel('marketplace') },
    { id: 'thumbnail', label: 'Thumbnail Studio', detail: 'Design YouTube, Shorts, and promo cover PNGs from your project.', run: openThumbnailStudio },
    { id: 'studio', label: 'Thumbnail Studio Pro', detail: 'Open the full thumbnail editor workspace in a dedicated window.', run: () => void openEdifyStudio() },
    { id: 'audio-editor', label: 'Audio Editor', detail: 'Open the full audio workspace for voice cleanup, mixing, recording, and export.', run: () => void openAudioEditor() },
    { id: 'premium', label: 'Premium Studio', detail: 'Plans, code field, premium packs, and ultra exports', run: openPremiumStudio },
    { id: 'shortcuts', label: 'Shortcuts', detail: 'Show the keyboard cheat sheet', shortcut: '?', run: () => setShowShortcuts(true) },
    { id: 'settings', label: 'Settings', detail: 'Open performance and app preferences', run: () => setShowSettings(true) }
  ], [createNewProject, importMedia, openAudioEditor, openEdifyStudio, openPanel, openPremiumStudio, openThumbnailStudio, saveProject]);

  const renameRecentProject = useCallback(async (project: ProjectSummary) => {
    const nextName = window.prompt('Rename project', project.name)?.trim();
    if (!nextName) return;
    const result = await edifyApi.renameProject(project.path, nextName);
    if (result.recentProjects) {
      setRecentProjects(result.recentProjects as ProjectSummary[]);
    }
    if (editor.project.path === project.path && result.document) {
      editor.setProject(result.document as ProjectDocument, editor.saveStatus);
    }
    pushToast({ title: 'Project renamed', detail: nextName, tone: 'success' });
  }, [editor, pushToast]);

  const deleteRecentProject = useCallback(async (project: ProjectSummary) => {
    const confirmed = window.confirm(
      project.source === 'cloud'
        ? `Delete "${project.name}" from your Edify cloud account?`
        : `Delete "${project.name}" from disk and recent projects?`
    );
    if (!confirmed) return;
    const result = await edifyApi.deleteProject(project.path);
    if (result.recentProjects) {
      setRecentProjects(result.recentProjects as ProjectSummary[]);
    }
    pushToast({ title: 'Project deleted', detail: project.name, tone: 'success' });
  }, [pushToast]);

  const restoreRecovery = useCallback(async () => {
    setShowRecovery(false);
    try {
      const document = (await edifyApi.readAutosave()) as ProjectDocument | null;
      if (document) {
        editor.setProject(document, 'autosaved');
        setScreen('editor');
        await edifyApi.clearAutosave();
        await refreshBootstrap();
        pushToast({ title: 'Recovery project restored', detail: document.name, tone: 'success' });
        return;
      }
      await edifyApi.clearAutosave();
      await refreshBootstrap();
      pushToast({ title: 'No recovery file', detail: 'The recovery file was already cleared.', tone: 'info' });
    } catch (error) {
      await edifyApi.clearAutosave().catch(() => undefined);
      await refreshBootstrap().catch(() => undefined);
      pushToast({ title: 'Recovery failed', detail: error instanceof Error ? error.message : 'Edify could not restore this autosave.', tone: 'warning' });
    }
  }, [editor, pushToast, refreshBootstrap]);

  const discardRecovery = useCallback(async () => {
    setShowRecovery(false);
    try {
      await edifyApi.clearAutosave();
      await refreshBootstrap();
      pushToast({ title: 'Recovery discarded', detail: 'The old autosave was cleared.', tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Could not clear recovery', detail: error instanceof Error ? error.message : 'The recovery file could not be removed.', tone: 'warning' });
    }
  }, [pushToast, refreshBootstrap]);

  const skipRecovery = useCallback(() => {
    setShowRecovery(false);
    pushToast({ title: 'Recovery hidden', detail: 'You can keep editing from the current screen.', tone: 'info' });
  }, [pushToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowCommandPalette(true);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        void importMedia();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setShowExport(true);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createNewProject('Untitled Edit');
      }
      if (event.code === 'Space') {
        event.preventDefault();
        editor.togglePlayback();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') editor.undo();
      if (event.ctrlKey && event.key.toLowerCase() === 'y') editor.redo();
      if (event.ctrlKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        editor.duplicateSelectedClip();
      }
      if (event.key === 'Delete') editor.deleteSelectedClip();
      if (event.key.toLowerCase() === 's' && !event.ctrlKey) editor.splitSelectedClip();
      if (event.key === '+' || event.key === '=') editor.setTimelineZoom(editor.timelineZoom + 8);
      if (event.key === '-') editor.setTimelineZoom(editor.timelineZoom - 8);
      if (event.key === 'ArrowRight') editor.setPlayhead(editor.playhead + 1 / editor.project.settings.fps);
      if (event.key === 'ArrowLeft') editor.setPlayhead(editor.playhead - 1 / editor.project.settings.fps);
      if (event.key === '?') setShowShortcuts(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createNewProject, editor, importMedia, saveProject]);

  return (
    <>
      {screen === 'home' ? (
        <HomeScreen
          recentProjects={recentProjects}
          bootstrap={bootstrap}
          accountUser={accountUser}
          onNewProject={createNewProject}
          onOpenProject={openProjectDialog}
          onOpenRecent={openProjectPath}
          onRenameRecent={renameRecentProject}
          onDeleteRecent={deleteRecentProject}
          onImportMedia={importMedia}
          onOpenPremium={openPremiumStudio}
          onOpenThumbnailStudio={openThumbnailStudio}
          onOpenAudioEditor={() => { void openAudioEditor(); }}
          onOpenEdifyStudio={() => { void openEdifyStudio(); }}
          onOpenAccount={() => setShowAccount(true)}
          onOpenPanel={openPanel}
          onDropFiles={inspectDroppedFiles}
        />
      ) : (
        <EditorShell
          editor={editor}
          bootstrap={bootstrap}
          accountUser={accountUser}
          onOpenAccount={() => setShowAccount(true)}
          onBackHome={() => setScreen('home')}
          onImportMedia={importMedia}
          onSave={() => void saveProject(false)}
          onSaveAs={() => void saveProject(true)}
          onExport={() => setShowExport(true)}
          onShortcuts={() => setShowShortcuts(true)}
          onSettings={() => setShowSettings(true)}
          onOpenThumbnailStudio={openThumbnailStudio}
          onDropFiles={inspectDroppedFiles}
          onStudioFeature={(featureId) => {
            editor.applyStudioFeature(featureId);
          }}
          pushToast={pushToast}
        />
      )}

      {showExport && (
        <ExportModal
          project={editor.project}
          accountUser={accountUser}
          onOpenAccount={() => {
            setShowExport(false);
            setShowAccount(true);
          }}
          onClose={() => setShowExport(false)}
          pushToast={pushToast}
        />
      )}

      {showAccount && (
        <AccountModal
          user={accountUser}
          recentProjects={recentProjects}
          busyProvider={accountBusyProvider}
          message={accountMessage}
          onClose={() => setShowAccount(false)}
          onProviderSelect={(provider) => {
            setAccountBusyProvider(provider);
            setAccountMessage(undefined);
            void edifyApi.startDesktopOAuth(provider)
              .then((user) => {
                setAccountUser(user ?? null);
                void refreshBootstrap();
                pushToast({
                  title: 'Account connected',
                  detail: user?.email || 'Your Edify desktop account is now active.',
                  tone: 'success'
                });
              })
              .catch((error: unknown) => {
                setAccountMessage(error instanceof Error ? error.message : 'Desktop sign-in could not be completed.');
              })
              .finally(() => {
                setAccountBusyProvider(null);
              });
          }}
          onSignOut={() => {
            setAccountMessage(undefined);
            void edifyApi.signOutDesktopAccount()
              .then(() => {
                setAccountUser(null);
                setShowAccount(false);
                void refreshBootstrap();
                pushToast({
                  title: 'Signed out',
                  detail: 'Your desktop account session was removed.',
                  tone: 'info'
                });
              })
              .catch((error: unknown) => {
                setAccountMessage(error instanceof Error ? error.message : 'Desktop sign-out could not be completed.');
              });
          }}
        />
      )}

      {showShortcuts && <ShortcutModal onClose={() => setShowShortcuts(false)} />}

      {showThumbnailStudio && (
        <ThumbnailStudioModal
          project={editor.project}
          onClose={() => setShowThumbnailStudio(false)}
          onImportMedia={importMedia}
          accountUser={accountUser}
          onOpenAccount={() => setShowAccount(true)}
          pushToast={pushToast}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          actions={commandActions}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {showSettings && bootstrap && (
        <SettingsModal
          settings={bootstrap.settings}
          onClose={() => setShowSettings(false)}
          onSettingsChange={(settings) => setBootstrap((current) => current ? { ...current, settings } : current)}
          pushToast={pushToast}
        />
      )}

      {showRecovery && (
        <div className="modal-scrim">
          <div className="dialog recovery-dialog">
            <div className="dialog-icon">
              <AlertTriangle size={20} />
            </div>
            <h2>Recovery project found</h2>
            <p>Edify found a local autosave from the last session. Restore it or clear the recovery file.</p>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" onClick={skipRecovery}>Later</button>
              <button className="ghost-button" type="button" onClick={discardRecovery}>Discard</button>
              <button className="primary-button" type="button" onClick={restoreRecovery}>Restore project</button>
            </div>
          </div>
        </div>
      )}

      {showConsent && (
        <div className="modal-scrim">
          <div className="dialog consent-dialog">
            <div className="dialog-icon consent-icon">
              <AlertTriangle size={20} />
            </div>
            <h2>Welcome to Edify</h2>
            <p>
              Before you continue, please review and accept the local-use terms for this device. Edify needs local storage permissions
              for projects, autosaves, settings, recovery data, and optional account-linked features so the editor behaves like a real desktop app.
            </p>
            <div className="consent-scroll">
              <div className="consent-points">
                <div className="consent-point">
                  <strong>1. Local project and recovery storage</strong>
                  <span>Edify stores project files, timeline metadata, media references, autosaves, cache items, and recovery copies on this PC so you can reopen work after restarts or unexpected crashes.</span>
                </div>
                <div className="consent-point">
                  <strong>2. Account, premium, and rewards state</strong>
                  <span>If you connect an account, Edify can keep your provider identity, premium plans, promo history, rewards, and light cloud project records attached to this installation and your Edify profile.</span>
                </div>
                <div className="consent-point">
                  <strong>3. Device permissions only when needed</strong>
                  <span>Edify only uses local file access when you import or save, and only uses microphone access when you explicitly start a voice recording or caption-related tool.</span>
                </div>
                <div className="consent-point">
                  <strong>4. Local-first by default</strong>
                  <span>Your source videos, images, and audio stay on your machine unless you later choose connected features. Edify does not automatically upload your media library.</span>
                </div>
                <div className="consent-point">
                  <strong>5. One-time acceptance for this install</strong>
                  <span>This acceptance is remembered for the current installed copy of Edify. Reinstalling or clearing local app data may ask for consent again on a fresh setup.</span>
                </div>
              </div>
            </div>
            <label className="consent-check">
              <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} />
              <span>I have read and accept the Edify local-use conditions, storage behavior, and device permission policy for this installation.</span>
            </label>
            <div className="consent-links">
              <button className="consent-link-button" type="button" onClick={() => void edifyApi.openExternalUrl('https://edify.app/privacy')}>
                Privacy
              </button>
              <button className="consent-link-button" type="button" onClick={() => void edifyApi.openExternalUrl('https://edify.app/terms')}>
                Terms
              </button>
              <button className="consent-link-button" type="button" onClick={() => void edifyApi.openExternalUrl('mailto:support@edify.app')}>
                Support
              </button>
            </div>
            <div className="dialog-actions">
              <button
                className="ghost-button"
                type="button"
                disabled={!consentChecked}
                onClick={() => {
                  void edifyApi.acceptLaunchConsent('essential').then(() => {
                    setShowConsent(false);
                    setConsentChecked(false);
                    pushToast({ title: 'Preferences saved', detail: 'Edify will keep only the essential local app data needed to run.', tone: 'info' });
                  });
                }}
              >
                Essential only
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!consentChecked}
                onClick={() => {
                  void edifyApi.acceptLaunchConsent('all').then(() => {
                    setShowConsent(false);
                    setConsentChecked(false);
                    pushToast({ title: 'Welcome to Edify', detail: 'Your local app preferences were accepted for this device.', tone: 'success' });
                  });
                }}
              >
                Accept conditions
              </button>
            </div>
          </div>
        </div>
      )}

      {showClosePrompt && (
        <div className="modal-scrim">
          <div className="dialog close-dialog">
            <div className="dialog-icon close-dialog-icon">
              <AlertTriangle size={20} />
            </div>
            <h2>Leave this project?</h2>
            <p>
              <strong>{editor.project.name}</strong> still has unsaved edits. Save it to a project file, close without saving, or stay inside Edify and keep working.
            </p>
            <div className="close-dialog-grid">
              <button
                className="close-option-card is-primary"
                type="button"
                onClick={() => {
                  void saveProject(false).then((result) => {
                    if (!result?.canceled) {
                      setShowClosePrompt(false);
                      void edifyApi.forceWindowClose();
                    }
                  });
                }}
              >
                <strong>Save project</strong>
                <span>Write the current timeline to your .edify file and then close the application.</span>
              </button>
              <button
                className="close-option-card"
                type="button"
                onClick={() => {
                  setShowClosePrompt(false);
                  void edifyApi.forceWindowClose();
                }}
              >
                <strong>Close without saving</strong>
                <span>Discard the current unsaved changes from this session and leave Edify now.</span>
              </button>
              <button
                className="close-option-card"
                type="button"
                onClick={() => setShowClosePrompt(false)}
              >
                <strong>Keep editing</strong>
                <span>Return to your timeline and continue working without closing the app.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {forcedUpdate?.visible && (
        <div className="modal-scrim forced-update-scrim">
          <section className="modal forced-update-modal">
            <header className="forced-update-hero">
              <div className="forced-update-icon">
                <Rocket size={28} />
              </div>
              <div>
                <span className="modal-eyebrow">Required update</span>
                <h2>Edify is installing a required update</h2>
                <p>
                  {forcedUpdate.phase === 'available' && 'A required Edify update was found. The app is downloading it now.'}
                  {forcedUpdate.phase === 'checking' && 'Edify is checking GitHub releases for the latest required desktop build.'}
                  {forcedUpdate.phase === 'downloading' && 'Downloading the required update. Edify will continue as soon as this version is installed.'}
                  {forcedUpdate.phase === 'downloaded' && 'The update is ready. Edify is preparing the installer now.'}
                  {forcedUpdate.phase === 'installing' && 'Installing the required update now. Edify will restart automatically.'}
                  {forcedUpdate.phase === 'error' && 'The required update could not be downloaded correctly. Please restart Edify and try again.'}
                </p>
              </div>
              <span className="forced-update-version">{forcedUpdate.version ? `v${forcedUpdate.version}` : 'Latest'}</span>
            </header>
            <div className="forced-update-body">
              <div className="forced-update-changelog">
                <strong>What this update improves</strong>
                <div>
                  <span><AudioLines size={15} /> Audio Editor polish, clearer waveform, region export, and better recording controls.</span>
                  <span><ImagePlus size={15} /> Thumbnail Studio fixes and premium workflow stability.</span>
                  <span><Settings2 size={15} /> Settings Center, update reliability, cache, account, and diagnostics surfaces.</span>
                </div>
              </div>
              <div className="forced-update-progress">
                <div className="forced-update-progress-copy">
                  <span>{forcedUpdate.phase === 'installing' ? 'Installing update' : forcedUpdate.phase === 'downloading' ? 'Downloading update' : forcedUpdate.phase === 'downloaded' ? 'Preparing restart' : forcedUpdate.phase === 'checking' ? 'Checking releases' : forcedUpdate.phase === 'error' ? 'Update failed' : 'Preparing update'}</span>
                  <strong>{forcedUpdate.phase === 'error' ? 'Update blocked' : `${Math.max(0, Math.min(100, forcedUpdate.percent))}%`}</strong>
                </div>
                <div className="forced-update-progress-bar">
                  <i style={{ width: `${Math.max(8, forcedUpdate.percent)}%` }} />
                </div>
              </div>
              <div className="forced-update-stage">
                <span className={forcedUpdate.phase === 'checking' ? 'is-active' : forcedUpdate.phase !== 'error' ? 'is-done' : ''}>Check</span>
                <span className={forcedUpdate.phase === 'available' ? 'is-active' : forcedUpdate.phase === 'downloading' || forcedUpdate.phase === 'downloaded' || forcedUpdate.phase === 'installing' ? 'is-done' : ''}>Found</span>
                <span className={forcedUpdate.phase === 'downloading' ? 'is-active' : forcedUpdate.percent >= 100 ? 'is-done' : ''}>Download</span>
                <span className={forcedUpdate.phase === 'downloaded' || forcedUpdate.phase === 'installing' ? 'is-active' : ''}>Prepare</span>
                <span className={forcedUpdate.phase === 'installing' ? 'is-active' : ''}>Install</span>
              </div>
              <div className="forced-update-note">
                <strong>Update required</strong>
                <span>
                  This build must be installed before you can keep editing. There is no later option for this release.
                </span>
              </div>
              {forcedUpdate.detail && <small className="forced-update-error">{forcedUpdate.detail}</small>}
            </div>
          </section>
        </div>
      )}

      {showWhatsNew && !forcedUpdate?.visible && !showConsent && (
        <div className="whats-new-dock" role="dialog" aria-label="What's new in Edify">
          <button className="icon-button whats-new-close" type="button" onClick={dismissWhatsNew} title="Close">
            <X size={15} />
          </button>
          <span className="modal-eyebrow">What's new</span>
          <h3>Edify {bootstrap?.appVersion ?? '0.1.6'} is ready</h3>
          <div className="whats-new-list">
            <article>
              <AudioLines size={18} />
              <span><strong>Audio Editor</strong><small>Clearer waveform, region selection, export polish, and recording controls.</small></span>
            </article>
            <article>
              <ImagePlus size={18} />
              <span><strong>Thumbnail Studio fixes</strong><small>Layer actions, premium flow, and editor stability improved.</small></span>
            </article>
            <article>
              <Rocket size={18} />
              <span><strong>Performance improvements</strong><small>Dashboard scroll and launch layout feel lighter and cleaner.</small></span>
            </article>
          </div>
          <button className="primary-button" type="button" onClick={dismissWhatsNew}>Continue</button>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </>
  );
}
