import {
  ArrowLeft,
  AudioLines,
  Bot,
  Download,
  FastForward,
  FolderOpen,
  Library,
  ListMusic,
  Mic,
  Music2,
  Pause,
  Play,
  Radio,
  Redo2,
  Repeat,
  Rewind,
  Save,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  Wand2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastStack } from '../ToastStack';
import { edifyApi } from '../../lib/bridge';
import { createGeneratedSoundDataUrl, createWaveformForName } from '../../lib/generatedAudio';
import { createId } from '../../lib/id';
import type { Toast } from '../../types/edify';
import type {
  AudioEditorAiTool,
  AudioEditorAsset,
  AudioEditorBootstrap,
  AudioEditorCleanupTool,
  AudioEditorClip,
  AudioEditorEffect,
  AudioEditorExportFormat,
  AudioEditorProject,
  AudioEditorProjectSummary,
  AudioEditorQuality,
  AudioEditorSidebarSection,
  AudioEditorTrack
} from '../../types/audioEditor';

type HistorySnapshot = {
  label: string;
  project: AudioEditorProject;
};

const librarySeeds = [
  { name: 'Skyline Chill Loop', category: 'Background Music', duration: 18, color: '#5b8cff' },
  { name: 'Cinema Impact Hit', category: 'Cinematic Hits', duration: 2.4, color: '#9f7cff' },
  { name: 'Fast Whoosh Sweep', category: 'Whooshes', duration: 1.8, color: '#42e8ff' },
  { name: 'UI Click Pack', category: 'Clicks', duration: 0.8, color: '#58ffb0' },
  { name: 'Soft Transition Air', category: 'Transitions', duration: 2.2, color: '#6cc4ff' },
  { name: 'Night Ambience Bed', category: 'Ambience', duration: 16, color: '#7b91ff' },
  { name: 'Studio Notification Ping', category: 'UI Sounds', duration: 1.1, color: '#ffd166' }
] as const;

type LibrarySeed = {
  name: string;
  category: string;
  duration: number;
  color: string;
};

const exportPresets = [
  { id: 'youtube', label: 'YouTube Thumbnail 1280x720', sampleRate: '48kHz', quality: 'High' as AudioEditorQuality },
  { id: 'roblox-thumb', label: 'Roblox Thumbnail', sampleRate: '44.1kHz', quality: 'High' as AudioEditorQuality },
  { id: 'roblox-icon', label: 'Roblox Game Icon', sampleRate: '44.1kHz', quality: 'Medium' as AudioEditorQuality },
  { id: 'discord', label: 'Discord Banner', sampleRate: '48kHz', quality: 'High' as AudioEditorQuality },
  { id: 'instagram', label: 'Instagram Post', sampleRate: '44.1kHz', quality: 'High' as AudioEditorQuality },
  { id: 'tiktok', label: 'TikTok Cover', sampleRate: '48kHz', quality: 'High' as AudioEditorQuality }
];

const cleanupTemplate = (): AudioEditorCleanupTool[] => [
  { id: 'noise', name: 'Remove Background Noise', description: 'Clean hiss and room rumble from the selected voice clip.', applied: false, processing: false },
  { id: 'enhance', name: 'Voice Enhance', description: 'Lift intelligibility and bring speech forward.', applied: false, processing: false },
  { id: 'deesser', name: 'De-Esser', description: 'Tame harsh S sounds with a lighter top end.', applied: false, processing: false },
  { id: 'echo', name: 'Remove Echo', description: 'Reduce roomy slap and reflection build-up.', applied: false, processing: false },
  { id: 'normalize', name: 'Normalize Loudness', description: 'Bring overall level into a cleaner editing range.', applied: false, processing: false },
  { id: 'level', name: 'Auto Level', description: 'Balance voice loudness across the clip.', applied: false, processing: false },
  { id: 'silence', name: 'Silence Remover', description: 'Trim dead air around spoken phrases.', applied: false, processing: false }
];

const aiTemplate = (): AudioEditorAiTool[] => [
  { id: 'subtitles', name: 'Auto subtitles from audio', description: 'Generate subtitle text from the selected spoken clip.', processing: false, applied: false },
  { id: 'cleaner', name: 'Voice cleaner', description: 'Create a cleaned duplicate with stronger spoken focus.', processing: false, applied: false },
  { id: 'isolation', name: 'Voice isolation', description: 'Push vocals forward and push ambience down.', processing: false, applied: false },
  { id: 'speech', name: 'Speech to text', description: 'Create a transcript note from the current selection.', processing: false, applied: false },
  { id: 'tone', name: 'Voice tone enhancer', description: 'Add presence and richer creator-style polish.', processing: false, applied: false },
  { id: 'silences', name: 'Auto remove silences', description: 'Build a tighter spoken edit with faster pacing.', processing: false, applied: false }
];

const baseEffects = (): AudioEditorEffect[] => [
  { id: 'eq', name: 'Equalizer', enabled: true, amount: 45 },
  { id: 'reverb', name: 'Reverb', enabled: false, amount: 22 },
  { id: 'echo', name: 'Echo', enabled: false, amount: 18 },
  { id: 'bass', name: 'Bass Boost', enabled: false, amount: 36 },
  { id: 'compressor', name: 'Compressor', enabled: true, amount: 42 },
  { id: 'limiter', name: 'Limiter', enabled: true, amount: 56 },
  { id: 'distortion', name: 'Distortion', enabled: false, amount: 12 },
  { id: 'highpass', name: 'High Pass Filter', enabled: false, amount: 28 },
  { id: 'lowpass', name: 'Low Pass Filter', enabled: false, amount: 22 }
];

const eqBandDefaults = {
  '60Hz': 0,
  '170Hz': 0,
  '310Hz': 0,
  '600Hz': 0,
  '1kHz': 0,
  '3kHz': 0,
  '6kHz': 0,
  '12kHz': 0
};

function cloneProject(project: AudioEditorProject): AudioEditorProject {
  return JSON.parse(JSON.stringify(project)) as AudioEditorProject;
}

function createLibraryAsset(seed: LibrarySeed): AudioEditorAsset {
  return {
    id: createId('audio-asset'),
    name: seed.name,
    path: `edify-audio://${seed.name.toLowerCase().replace(/\s+/g, '-')}`,
    previewUrl: createGeneratedSoundDataUrl({ name: seed.name, duration: seed.duration, tag: seed.category }),
    duration: seed.duration,
    waveform: createWaveformForName(seed.name, 84),
    category: seed.category,
    format: 'WAV',
    importedAt: new Date().toISOString(),
    kind: 'library'
  };
}

function createDefaultProject(): AudioEditorProject {
  const now = new Date().toISOString();
  const demoAsset = createLibraryAsset(librarySeeds[0]);
  const voiceAsset = createLibraryAsset({ name: 'Voice Take 01', category: 'Voice', duration: 8.6, color: '#42e8ff' });
  const tracks: AudioEditorTrack[] = [
    {
      id: createId('track'),
      name: 'Voice Track',
      color: '#42e8ff',
      mute: false,
      solo: false,
      locked: false,
      volume: 0.86,
      clips: [{
        id: createId('clip'),
        assetId: voiceAsset.id,
        name: voiceAsset.name,
        trackId: '',
        start: 0.4,
        duration: 8.2,
        offset: 0,
        color: '#1d5566',
        volume: 0.92,
        pan: 0,
        fadeIn: 0.08,
        fadeOut: 0.12,
        pitch: 0,
        speed: 1,
        reversed: false
      }]
    },
    {
      id: createId('track'),
      name: 'Music Track',
      color: '#7f63ff',
      mute: false,
      solo: false,
      locked: false,
      volume: 0.52,
      clips: [{
        id: createId('clip'),
        assetId: demoAsset.id,
        name: demoAsset.name,
        trackId: '',
        start: 0,
        duration: 13.6,
        offset: 0,
        color: '#42308f',
        volume: 0.48,
        pan: 0,
        fadeIn: 0.22,
        fadeOut: 0.3,
        pitch: 0,
        speed: 1,
        reversed: false
      }]
    },
    {
      id: createId('track'),
      name: 'SFX Track',
      color: '#58ffb0',
      mute: false,
      solo: false,
      locked: false,
      volume: 0.74,
      clips: []
    },
    {
      id: createId('track'),
      name: 'Master Track',
      color: '#ffd166',
      mute: false,
      solo: false,
      locked: true,
      volume: 1,
      clips: []
    }
  ].map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip, trackId: track.id }))
  }));

  const duration = 18;
  return {
    id: createId('audio-project'),
    kind: 'audio-editor',
    version: 1,
    name: 'Untitled Audio Project',
    createdAt: now,
    updatedAt: now,
    sampleRate: '48kHz',
    playbackRate: 1,
    zoom: 1,
    loop: false,
    duration,
    background: '#081019',
    assets: [voiceAsset, demoAsset],
    tracks,
    selectedClipId: tracks[0].clips[0]?.id ?? null,
    selectedTrackId: tracks[0].id,
    selectedRegion: null,
    history: [{ id: createId('history'), label: 'Created audio project', createdAt: now }],
    effects: baseEffects(),
    eqBands: { ...eqBandDefaults }
  };
}

function formatTime(value: number) {
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 100);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
}

function encodeWav(audioBuffer: AudioBuffer) {
  const channelData = audioBuffer.numberOfChannels > 1
    ? mixDownChannels(audioBuffer)
    : audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const dataLength = channelData.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let index = 0; index < channelData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, channelData[index] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function mixDownChannels(audioBuffer: AudioBuffer) {
  const output = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const input = audioBuffer.getChannelData(channel);
    for (let index = 0; index < input.length; index += 1) {
      output[index] += input[index] / audioBuffer.numberOfChannels;
    }
  }
  return output;
}

function cloneReversedBuffer(context: BaseAudioContext, source: AudioBuffer) {
  const next = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = next.getChannelData(channel);
    for (let index = 0; index < input.length; index += 1) {
      output[index] = input[input.length - index - 1] ?? 0;
    }
  }
  return next;
}

async function getAudioBuffer(asset: AudioEditorAsset, cache: Map<string, AudioBuffer>, context: AudioContext | OfflineAudioContext) {
  const existing = cache.get(asset.id);
  if (existing) return existing;
  const response = await fetch(asset.previewUrl);
  const arrayBuffer = await response.arrayBuffer();
  const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
  cache.set(asset.id, decoded);
  return decoded;
}

async function renderProjectAudio(project: AudioEditorProject, assets: AudioEditorAsset[], sampleRate: number, cache: Map<string, AudioBuffer>) {
  const region = project.selectedRegion;
  const startAt = region ? region.start : 0;
  const endAt = region ? region.end : project.duration;
  const duration = Math.max(0.5, endAt - startAt);
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const soloTrackIds = project.tracks.filter((track) => track.solo).map((track) => track.id);

  for (const track of project.tracks) {
    if (track.name === 'Master Track') continue;
    if (track.mute) continue;
    if (soloTrackIds.length > 0 && !soloTrackIds.includes(track.id)) continue;

    for (const clip of track.clips) {
      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;
      const baseBuffer = await getAudioBuffer(asset, cache, offline);
      const buffer = clip.reversed ? cloneReversedBuffer(offline, baseBuffer) : baseBuffer;
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Math.max(0.25, clip.speed * Math.pow(2, clip.pitch / 12));

      const gain = offline.createGain();
      const panner = offline.createStereoPanner();
      gain.gain.value = 0;
      panner.pan.value = clip.pan;
      source.connect(gain);
      gain.connect(panner);
      panner.connect(offline.destination);

      const relativeStart = clip.start - startAt;
      const naturalDuration = Math.max(0.05, clip.duration);
      const sourceOffset = Math.max(0, clip.offset);
      if (relativeStart + naturalDuration <= 0 || relativeStart >= duration) continue;

      const actualStart = Math.max(0, relativeStart);
      const trimAtStart = Math.max(0, -relativeStart);
      const effectiveOffset = sourceOffset + trimAtStart;
      const playableDuration = Math.min(naturalDuration - trimAtStart, duration - actualStart);
      if (playableDuration <= 0) continue;

      const baseGain = Math.max(0, Math.min(1.5, clip.volume * track.volume));
      gain.gain.setValueAtTime(0.0001, actualStart);
      gain.gain.linearRampToValueAtTime(baseGain, actualStart + Math.min(clip.fadeIn || 0.01, playableDuration));
      gain.gain.setValueAtTime(baseGain, Math.max(actualStart, actualStart + playableDuration - Math.max(clip.fadeOut, 0.01)));
      gain.gain.linearRampToValueAtTime(0.0001, actualStart + playableDuration);

      source.start(actualStart, effectiveOffset, playableDuration);
    }
  }

  return offline.startRendering();
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = createId('toast');
    setToasts((current) => [...current, { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);
  return { toasts, pushToast };
}

export function AudioEditorWindow() {
  const [bootstrap, setBootstrap] = useState<AudioEditorBootstrap | null>(null);
  const [project, setProject] = useState<AudioEditorProject>(() => createDefaultProject());
  const [activeSection, setActiveSection] = useState<AudioEditorSidebarSection>('import');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(project.selectedClipId ?? null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [processingCleanup, setProcessingCleanup] = useState<AudioEditorCleanupTool[]>(cleanupTemplate());
  const [aiTools, setAiTools] = useState<AudioEditorAiTool[]>(aiTemplate());
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingLevel, setRecordingLevel] = useState(0.12);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [inputGain, setInputGain] = useState(1);
  const [monitoring, setMonitoring] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(0);
  const [autosaveStamp, setAutosaveStamp] = useState('Saved just now');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [selectionDraft, setSelectionDraft] = useState<{ start: number; end: number } | null>(null);
  const { toasts, pushToast } = useToasts();

  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyUndoRef = useRef<HistorySnapshot[]>([]);
  const historyRedoRef = useRef<HistorySnapshot[]>([]);
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const playbackRafRef = useRef<number | null>(null);
  const playbackStartedAtRef = useRef(0);
  const playbackInitialRef = useRef(0);

  const selectedClip = useMemo(() => {
    for (const track of project.tracks) {
      const found = track.clips.find((clip) => clip.id === selectedClipId);
      if (found) return found;
    }
    return null;
  }, [project.tracks, selectedClipId]);

  const selectedTrack = useMemo(() => project.tracks.find((track) => track.id === selectedClip?.trackId) ?? project.tracks[0], [project.tracks, selectedClip?.trackId]);
  const assetMap = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const selectedAsset = selectedClip ? assetMap.get(selectedClip.assetId) ?? null : null;
  const totalTracks = project.tracks.length;
  const projectDuration = useMemo(() => Math.max(project.duration, ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.duration)), 0), [project.duration, project.tracks]);
  const timeScale = 110 * project.zoom;

  const pushHistory = useCallback((label: string, nextProject: AudioEditorProject) => {
    historyUndoRef.current.push({ label, project: cloneProject(project) });
    if (historyUndoRef.current.length > 60) historyUndoRef.current.shift();
    historyRedoRef.current = [];
    const entry = { id: createId('history'), label, createdAt: new Date().toISOString() };
    setProject({ ...nextProject, history: [entry, ...nextProject.history].slice(0, 28), updatedAt: new Date().toISOString() });
  }, [project]);

  const mutateProject = useCallback((label: string, mutator: (current: AudioEditorProject) => AudioEditorProject) => {
    const next = mutator(cloneProject(project));
    pushHistory(label, next);
  }, [project, pushHistory]);

  const selectedRegion = selectionDraft ?? project.selectedRegion ?? null;

  useEffect(() => {
    void edifyApi.getAudioEditorBootstrap().then((info) => setBootstrap(info));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void edifyApi.saveAudioEditorProject(project, project.path).then((result) => {
        if (!result?.canceled && result.document) {
          setProject((current) => ({ ...(result.document as AudioEditorProject), history: current.history }));
          setAutosaveStamp('Saved just now');
        }
      }).catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [project]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
      setRecordingLevel(0.18 + Math.random() * 0.72);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    void navigator.mediaDevices.enumerateDevices()
      .then((devices) => {
        const inputs = devices.filter((device) => device.kind === 'audioinput');
        setAudioInputs(inputs);
        if (!selectedInputId && inputs[0]) setSelectedInputId(inputs[0].deviceId);
      })
      .catch(() => undefined);
  }, [selectedInputId]);

  const stopPlaybackAnimation = useCallback(() => {
    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPlaybackAnimation(), [stopPlaybackAnimation]);

  const tickPlayback = useCallback((now: number) => {
    const elapsed = (now - playbackStartedAtRef.current) / 1000 * project.playbackRate;
    const next = playbackInitialRef.current + elapsed;
    if (next >= projectDuration) {
      if (project.loop) {
        playbackStartedAtRef.current = now;
        playbackInitialRef.current = 0;
        setPlayhead(0);
      } else {
        setIsPlaying(false);
        setPlayhead(projectDuration);
        stopPlaybackAnimation();
        return;
      }
    } else {
      setPlayhead(next);
    }
    playbackRafRef.current = requestAnimationFrame(tickPlayback);
  }, [project.playbackRate, project.loop, projectDuration, stopPlaybackAnimation]);

  const startAudioPreview = useCallback(async () => {
    const targetClip = selectedClip ?? project.tracks.flatMap((track) => track.clips).find(Boolean) ?? null;
    if (!targetClip) return;
    const asset = assetMap.get(targetClip.assetId);
    if (!asset?.previewUrl) return;
    const audio = audioPreviewRef.current ?? new Audio();
    audioPreviewRef.current = audio;
    audio.src = asset.previewUrl;
    audio.currentTime = Math.max(0, Math.min(asset.duration, playhead - targetClip.start + targetClip.offset));
    audio.playbackRate = Math.max(0.5, Math.min(2, project.playbackRate * targetClip.speed));
    audio.volume = Math.max(0, Math.min(1, targetClip.volume * selectedTrack.volume));
    try {
      await audio.play();
    } catch {
      pushToast({ title: 'Playback blocked', detail: 'Click play again or check your audio output.', tone: 'warning' });
    }
  }, [assetMap, playhead, project.playbackRate, project.tracks, pushToast, selectedClip, selectedTrack.volume]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      stopPlaybackAnimation();
      audioPreviewRef.current?.pause();
      return;
    }
    playbackStartedAtRef.current = performance.now();
    playbackInitialRef.current = playhead;
    setIsPlaying(true);
    void startAudioPreview();
    playbackRafRef.current = requestAnimationFrame(tickPlayback);
  }, [isPlaying, playhead, startAudioPreview, stopPlaybackAnimation, tickPlayback]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    setPlayhead(0);
    audioPreviewRef.current?.pause();
    if (audioPreviewRef.current) audioPreviewRef.current.currentTime = 0;
    stopPlaybackAnimation();
  }, [stopPlaybackAnimation]);

  const saveProject = useCallback(async (saveAs = false) => {
    const result = saveAs
      ? await edifyApi.saveAudioEditorProjectAs(project)
      : await edifyApi.saveAudioEditorProject(project, project.path);
    if (!result?.canceled && result.document) {
      setProject(result.document as AudioEditorProject);
      setAutosaveStamp('Saved just now');
      setBootstrap((current) => current ? { ...current, recentProjects: [{ id: result.document.id, name: result.document.name, path: result.document.path, updatedAt: result.document.updatedAt }, ...current.recentProjects.filter((item) => item.path !== result.document.path)].slice(0, 24) } : current);
      pushToast({ title: 'Project saved', detail: result.filePath, tone: 'success' });
    }
  }, [project, pushToast]);

  const openProject = useCallback(async () => {
    const result = await edifyApi.openAudioEditorProjectDialog();
    if (!result?.canceled && result.document) {
      setProject(result.document as AudioEditorProject);
      setSelectedClipId((result.document as AudioEditorProject).selectedClipId ?? null);
      pushToast({ title: 'Project opened', detail: (result.document as AudioEditorProject).name, tone: 'success' });
    }
  }, [pushToast]);

  const addAssetToTrack = useCallback((asset: AudioEditorAsset, trackId = project.tracks[1]?.id ?? project.tracks[0].id) => {
    const nextClipId = createId('audio-clip');
    mutateProject(`Added ${asset.name}`, (current) => {
      const nextTrackId = trackId;
      current.tracks = current.tracks.map((track) => {
        if (track.id !== nextTrackId) return track;
        const start = Math.max(0, ...track.clips.map((clip) => clip.start + clip.duration), 0);
        const clip: AudioEditorClip = {
          id: nextClipId,
          assetId: asset.id,
          name: asset.name,
          trackId: track.id,
          start,
          duration: asset.duration,
          offset: 0,
          color: track.color,
          volume: 0.84,
          pan: 0,
          fadeIn: 0.06,
          fadeOut: 0.08,
          pitch: 0,
          speed: 1,
          reversed: false,
          selected: true
        };
        current.selectedClipId = clip.id;
        current.selectedTrackId = track.id;
        return { ...track, clips: [...track.clips, clip] };
      });
      current.duration = Math.max(current.duration, ...current.tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.duration)));
      return current;
    });
    setSelectedClipId(nextClipId);
    pushToast({ title: 'Audio added', detail: `${asset.name} was added to the timeline.`, tone: 'success' });
  }, [mutateProject, project.tracks, pushToast]);

  const importAudio = useCallback(async () => {
    const imported = await edifyApi.importMedia();
    const audioOnly = imported.filter((asset) => asset.kind === 'audio');
    if (audioOnly.length === 0) {
      pushToast({ title: 'No audio imported', detail: 'Choose MP3, WAV, OGG, or M4A files to add to Audio Editor.', tone: 'warning' });
      return;
    }
    mutateProject(`Imported ${audioOnly.length} audio file${audioOnly.length > 1 ? 's' : ''}`, (current) => {
      current.assets = [...audioOnly.map((asset) => ({
        id: asset.id,
        name: asset.name,
        path: asset.path,
        previewUrl: asset.previewUrl ?? '',
        duration: asset.duration ?? 6,
        waveform: asset.waveform ?? createWaveformForName(asset.name, 84),
        category: 'Imported Audio',
        format: asset.extension ?? 'AUDIO',
        importedAt: asset.importedAt,
        kind: 'imported' as const
      })), ...current.assets];
      return current;
    });
    pushToast({ title: 'Audio imported', detail: `${audioOnly.length} file${audioOnly.length > 1 ? 's' : ''} ready in the media list.`, tone: 'success' });
  }, [mutateProject, pushToast]);

  const startRecording = useCallback(async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInputId
          ? { deviceId: { exact: selectedInputId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      recordStreamRef.current = stream;
      recorderChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(recorderChunksRef.current, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();
        const asset = await edifyApi.saveRecording(`Voice Take ${String(project.assets.filter((item) => item.kind === 'recording').length + 1).padStart(2, '0')}`, buffer);
        mutateProject('Saved recording', (current) => {
          current.assets = [{
            id: asset.id,
            name: asset.name,
            path: asset.path,
            previewUrl: asset.previewUrl ?? '',
            duration: asset.duration ?? Math.max(1, recordingSeconds),
            waveform: asset.waveform ?? createWaveformForName(asset.name, 84),
            category: 'Recorded Voice',
            format: asset.extension ?? 'WEBM',
            importedAt: asset.importedAt,
            kind: 'recording'
          }, ...current.assets];
          return current;
        });
        setRecording(false);
        setRecordingSeconds(0);
        setRecordingLevel(0.12);
        pushToast({ title: 'Recording saved', detail: `${asset.name} is now available in your media list.`, tone: 'success' });
        stream.getTracks().forEach((track) => track.stop());
        recordStreamRef.current = null;
      };
      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
      pushToast({ title: 'Recording started', detail: monitoring ? 'Monitoring enabled. The microphone is capturing a new voice take.' : 'The microphone is now capturing a new voice take.', tone: 'warning' });
    } catch (error) {
      pushToast({ title: 'Recording unavailable', detail: error instanceof Error ? error.message : 'Microphone access was blocked.', tone: 'danger' });
    }
  }, [monitoring, mutateProject, project.assets, pushToast, recording, recordingSeconds, selectedInputId]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const startRecordingCountdown = useCallback(() => {
    if (recording || recordCountdown > 0) return;
    setRecordCountdown(3);
    let remaining = 3;
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        setRecordCountdown(0);
        void startRecording();
      } else {
        setRecordCountdown(remaining);
      }
    }, 850);
  }, [recordCountdown, recording, startRecording]);

  const applyCleanupTool = useCallback((toolId: string) => {
    setProcessingCleanup((current) => current.map((tool) => tool.id === toolId ? { ...tool, processing: true } : tool));
    window.setTimeout(() => {
      setProcessingCleanup((current) => current.map((tool) => tool.id === toolId ? { ...tool, processing: false, applied: true } : tool));
      const tool = processingCleanup.find((item) => item.id === toolId);
      if (selectedClip) {
        mutateProject(`Applied ${tool?.name ?? 'cleanup tool'}`, (current) => {
          current.tracks = current.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) => clip.id === selectedClip.id ? {
              ...clip,
              volume: Math.min(1.1, clip.volume + 0.04),
              fadeIn: Math.max(clip.fadeIn, 0.05),
              fadeOut: Math.max(clip.fadeOut, 0.08)
            } : clip)
          }));
          return current;
        });
      }
      pushToast({ title: 'Effect applied', detail: `${tool?.name ?? 'Cleanup'} finished successfully.`, tone: 'success' });
    }, 950);
  }, [mutateProject, processingCleanup, pushToast, selectedClip]);

  const runAiTool = useCallback((toolId: string) => {
    setAiTools((current) => current.map((tool) => tool.id === toolId ? { ...tool, processing: true } : tool));
    window.setTimeout(() => {
      const tool = aiTools.find((item) => item.id === toolId);
      setAiTools((current) => current.map((item) => item.id === toolId ? { ...item, processing: false, applied: true } : item));
      if (selectedClip) {
        mutateProject(`Ran ${tool?.name ?? 'AI tool'}`, (current) => {
          const track = current.tracks.find((item) => item.id === selectedClip.trackId) ?? current.tracks[0];
          const derivedClip: AudioEditorClip = {
            ...selectedClip,
            id: createId('audio-clip'),
            name: `${selectedClip.name} • ${tool?.name ?? 'AI result'}`,
            start: selectedClip.start + 0.2,
            color: '#6a8fff'
          };
          track.clips = [...track.clips, derivedClip];
          current.selectedClipId = derivedClip.id;
          current.selectedTrackId = track.id;
          return current;
        });
      }
      pushToast({ title: 'AI result ready', detail: `${tool?.name ?? 'Audio AI'} created a new derived layer-style clip.`, tone: 'success' });
    }, 1200);
  }, [aiTools, mutateProject, pushToast, selectedClip]);

  const updateTrack = useCallback((trackId: string, updater: (track: AudioEditorTrack) => AudioEditorTrack, label: string) => {
    mutateProject(label, (current) => ({
      ...current,
      tracks: current.tracks.map((track) => track.id === trackId ? updater(track) : track)
    }));
  }, [mutateProject]);

  const updateSelectedClip = useCallback((updater: (clip: AudioEditorClip) => AudioEditorClip, label: string) => {
    if (!selectedClip) return;
    mutateProject(label, (current) => ({
      ...current,
      tracks: current.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === selectedClip.id ? updater(clip) : clip)
      }))
    }));
  }, [mutateProject, selectedClip]);

  const splitSelectedClip = useCallback(() => {
    if (!selectedClip) return;
    if (playhead <= selectedClip.start || playhead >= selectedClip.start + selectedClip.duration) return;
    mutateProject('Split clip', (current) => {
      current.tracks = current.tracks.map((track) => {
        if (track.id !== selectedClip.trackId) return track;
        const nextClips: AudioEditorClip[] = [];
        track.clips.forEach((clip) => {
          if (clip.id !== selectedClip.id) {
            nextClips.push(clip);
            return;
          }
          const splitAt = playhead - clip.start;
          const first: AudioEditorClip = { ...clip, id: createId('audio-clip'), duration: splitAt };
          const second: AudioEditorClip = {
            ...clip,
            id: createId('audio-clip'),
            start: playhead,
            offset: clip.offset + splitAt,
            duration: clip.duration - splitAt,
            selected: true
          };
          current.selectedClipId = second.id;
          nextClips.push(first, second);
        });
        return { ...track, clips: nextClips };
      });
      return current;
    });
    pushToast({ title: 'Split clip', detail: 'A new split point was created at the current playhead.', tone: 'success' });
  }, [mutateProject, playhead, pushToast, selectedClip]);

  const deleteSelectedClip = useCallback(() => {
    if (!selectedClip) return;
    mutateProject('Deleted selected clip', (current) => {
      current.tracks = current.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== selectedClip.id)
      }));
      current.selectedClipId = null;
      return current;
    });
    setSelectedClipId(null);
    pushToast({ title: 'Clip deleted', detail: `${selectedClip.name} was removed from the project.`, tone: 'warning' });
  }, [mutateProject, pushToast, selectedClip]);

  const duplicateSelectedClip = useCallback(() => {
    if (!selectedClip) return;
    mutateProject('Duplicated clip', (current) => {
      current.tracks = current.tracks.map((track) => {
        if (track.id !== selectedClip.trackId) return track;
        const duplicate = {
          ...selectedClip,
          id: createId('audio-clip'),
          start: selectedClip.start + selectedClip.duration + 0.15
        };
        current.selectedClipId = duplicate.id;
        return { ...track, clips: [...track.clips, duplicate] };
      });
      return current;
    });
    pushToast({ title: 'Clip duplicated', detail: `${selectedClip.name} was duplicated on the same track.`, tone: 'success' });
  }, [mutateProject, pushToast, selectedClip]);

  const reverseSelected = useCallback(() => {
    updateSelectedClip((clip) => ({ ...clip, reversed: !clip.reversed }), 'Reversed clip');
  }, [updateSelectedClip]);

  const normalizeSelected = useCallback(() => {
    updateSelectedClip((clip) => ({ ...clip, volume: 0.9, fadeIn: Math.max(clip.fadeIn, 0.04), fadeOut: Math.max(clip.fadeOut, 0.08) }), 'Normalized clip');
  }, [updateSelectedClip]);

  const setThemeAndToast = useCallback((next: 'dark' | 'light') => {
    setTheme(next);
    pushToast({ title: 'Theme updated', detail: `${next === 'dark' ? 'Dark' : 'Light'} mode is now active in Audio Editor.`, tone: 'info' });
  }, [pushToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;

      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openProject();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setProject(createDefaultProject());
        setSelectedClipId(null);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        const previous = historyUndoRef.current.pop();
        if (previous) {
          historyRedoRef.current.unshift({ label: 'redo', project: cloneProject(project) });
          setProject(previous.project);
          setSelectedClipId(previous.project.selectedClipId ?? null);
        }
      }
      if ((event.ctrlKey && event.key.toLowerCase() === 'y') || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'z')) {
        event.preventDefault();
        const next = historyRedoRef.current.shift();
        if (next) {
          historyUndoRef.current.push({ label: 'undo', project: cloneProject(project) });
          setProject(next.project);
          setSelectedClipId(next.project.selectedClipId ?? null);
        }
      }
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key.toLowerCase() === 's' && !event.ctrlKey) {
        event.preventDefault();
        splitSelectedClip();
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        deleteSelectedClip();
      }
      if (event.key.toLowerCase() === 'r' && !event.ctrlKey) {
        event.preventDefault();
        if (recording) {
          stopRecording();
        } else {
          void startRecording();
        }
      }
      if (event.key === '[') {
        event.preventDefault();
        setProject((current) => ({ ...current, zoom: Math.max(0.65, current.zoom - 0.08) }));
      }
      if (event.key === ']') {
        event.preventDefault();
        setProject((current) => ({ ...current, zoom: Math.min(2.8, current.zoom + 0.08) }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedClip, openProject, project, recording, saveProject, splitSelectedClip, startRecording, stopRecording, togglePlayback]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);
    context.fillStyle = theme === 'light' ? '#f4f7ff' : '#0f141f';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = theme === 'light' ? 'rgba(57,84,156,0.18)' : 'rgba(154,177,255,0.12)';
    for (let x = 0; x <= width; x += 48) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 44) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    project.tracks.forEach((track, trackIndex) => {
      const top = 28 + trackIndex * 94;
      context.fillStyle = theme === 'light' ? 'rgba(18,22,32,0.04)' : 'rgba(255,255,255,0.02)';
      context.fillRect(0, top, width, 76);

      track.clips.forEach((clip) => {
        const asset = assetMap.get(clip.assetId);
        const x = clip.start * timeScale;
        const clipWidth = Math.max(64, clip.duration * timeScale);
        const clipTop = top + 12;
        context.fillStyle = clip.id === selectedClipId ? 'rgba(111, 153, 255, 0.92)' : clip.color;
        roundRect(context, x, clipTop, clipWidth, 52, 10);
        context.fill();

        const bars = asset?.waveform ?? createWaveformForName(clip.name, 44);
        context.strokeStyle = 'rgba(255,255,255,0.78)';
        bars.forEach((value, index) => {
          const px = x + 10 + (index / bars.length) * (clipWidth - 20);
          const barHeight = 8 + (value / 100) * 22;
          context.beginPath();
          context.moveTo(px, clipTop + 26 - barHeight / 2);
          context.lineTo(px, clipTop + 26 + barHeight / 2);
          context.stroke();
        });

        context.fillStyle = '#f7fbff';
        context.font = '700 12px Inter, Segoe UI, sans-serif';
        context.fillText(clip.name, x + 12, clipTop + 18, clipWidth - 24);
      });
    });

    const playheadX = playhead * timeScale;
    context.fillStyle = '#42e8ff';
    context.fillRect(playheadX, 0, 2, height);
    context.beginPath();
    context.arc(playheadX + 1, 18, 6, 0, Math.PI * 2);
    context.fill();

    if (selectedRegion) {
      context.fillStyle = 'rgba(66, 232, 255, 0.14)';
      context.fillRect(selectedRegion.start * timeScale, 0, Math.max(0, (selectedRegion.end - selectedRegion.start) * timeScale), height);
    }
  }, [assetMap, playhead, project.tracks, selectedClipId, selectedRegion, theme, timeScale]);

  const levelMeterValues = useMemo(() => {
    return project.tracks.map((track) => {
      if (!isPlaying) return 0.16;
      const clipBoost = track.clips.some((clip) => clip.id === selectedClipId) ? 0.78 : 0.36;
      return Math.min(1, clipBoost * track.volume * (track.mute ? 0.1 : 1) * (0.72 + Math.random() * 0.22));
    });
  }, [isPlaying, project.tracks, selectedClipId]);

  return (
    <div className={`audio-editor-window ${theme === 'light' ? 'theme-light' : ''} ${fullscreenPreview ? 'is-preview' : ''}`}>
      <div className="audio-editor-shell">
        <header className="audio-topbar">
          <div className="audio-topbar-brand">
            <div className="brand-mark">E</div>
            <div>
              <strong>Audio Editor</strong>
              <small>{project.name}</small>
            </div>
          </div>
          <div className="audio-topbar-actions">
            <button className="secondary-button" type="button" onClick={() => void edifyApi.closeCurrentWindow()}><ArrowLeft size={16} /> Back to Dashboard</button>
            <button className="secondary-button" type="button" onClick={() => void openProject()}><FolderOpen size={16} /> Open</button>
            <button className="secondary-button" type="button" onClick={() => setShowSettings(true)}><Settings2 size={16} /> Settings</button>
            <button className="secondary-button" type="button" onClick={() => void saveProject(false)}><Save size={16} /> Save</button>
            <button className="primary-button" type="button" onClick={() => setShowExportModal(true)}><Download size={16} /> Export</button>
          </div>
        </header>

        <section className="audio-main-layout">
          <aside className="audio-sidebar">
            <div className="audio-sidebar-head">
              <span className="audio-pill new">NEW</span>
              <strong>Audio Editor</strong>
              <small>Import, clean, mix, and export audio projects.</small>
            </div>
            <div className="audio-sidebar-nav">
              <SidebarButton label="Import Audio" active={activeSection === 'import'} icon={<AudioLines size={16} />} onClick={() => setActiveSection('import')} />
              <SidebarButton label="Record Voice" active={activeSection === 'record'} icon={<Mic size={16} />} onClick={() => setActiveSection('record')} />
              <SidebarButton label="Sound Effects" active={activeSection === 'sfx'} icon={<Sparkles size={16} />} onClick={() => setActiveSection('sfx')} />
              <SidebarButton label="Music Library" active={activeSection === 'music'} icon={<Music2 size={16} />} onClick={() => setActiveSection('music')} />
              <SidebarButton label="Voice Tools" active={activeSection === 'voice-tools'} icon={<Bot size={16} />} onClick={() => setActiveSection('voice-tools')} />
              <SidebarButton label="Noise Cleanup" active={activeSection === 'cleanup'} icon={<Sparkles size={16} />} onClick={() => setActiveSection('cleanup')} />
              <SidebarButton label="Effects" active={activeSection === 'effects'} icon={<SlidersHorizontal size={16} />} onClick={() => setActiveSection('effects')} />
              <SidebarButton label="Export Presets" active={activeSection === 'export'} icon={<Download size={16} />} onClick={() => setActiveSection('export')} />
            </div>

            <div className="audio-sidebar-panel">
              {activeSection === 'import' && (
                <>
                  <PanelHeader title="Audio import" detail="MP3, WAV, OGG, M4A" />
                  <button className="primary-button" type="button" onClick={() => void importAudio()}><AudioLines size={16} /> Import audio</button>
                  <div className="audio-asset-list">
                    {project.assets.map((asset) => (
                      <button key={asset.id} className="audio-asset-card" type="button" onClick={() => addAssetToTrack(asset)}>
                        <span>
                          <strong>{asset.name}</strong>
                          <small>{asset.category} • {asset.format} • {asset.duration.toFixed(1)}s</small>
                        </span>
                        <span className="audio-asset-action">Add</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {activeSection === 'record' && (
                <>
                  <PanelHeader title="Voice recorder" detail="Record a fresh take into your project" />
                  <div className="audio-record-controls">
                    <label>
                      <span>Microphone</span>
                      <select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)}>
                        {audioInputs.length === 0 ? <option value="">System default microphone</option> : audioInputs.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Input gain {Math.round(inputGain * 100)}%</span>
                      <input type="range" min={0.4} max={1.6} step={0.05} value={inputGain} onChange={(event) => setInputGain(Number(event.target.value))} />
                    </label>
                    <button className={`audio-toggle ${monitoring ? 'is-on' : ''}`} type="button" onClick={() => setMonitoring((current) => !current)}>
                      <Volume2 size={14} /> Monitoring {monitoring ? 'on' : 'off'}
                    </button>
                  </div>
                  <div className={`audio-record-card ${recording ? 'is-live' : ''}`}>
                    <div>
                      <strong>{recording ? 'Recording…' : 'Voice capture ready'}</strong>
                      <small>{recording ? `Recording timer ${formatTime(recordingSeconds)}` : 'Recording saved as Voice Take 01, 02, 03…'}</small>
                    </div>
                    <div className="audio-record-meter"><i style={{ width: `${Math.min(1, recordingLevel * inputGain) * 100}%` }} /></div>
                  </div>
                  <div className="audio-inline-actions">
                    <button className={`primary-button ${recording ? 'recording-active' : ''}`} type="button" onClick={startRecordingCountdown} disabled={recording || recordCountdown > 0}><Mic size={16} /> {recordCountdown > 0 ? 'Get ready' : 'Start Recording'}</button>
                    <button className="ghost-button" type="button" onClick={stopRecording} disabled={!recording}><Square size={16} /> Stop Recording</button>
                  </div>
                </>
              )}

              {activeSection === 'sfx' && (
                <>
                  <PanelHeader title="Sound effects" detail="Impacts, transitions, and UI hits" />
                  <LibraryList
                    items={project.assets.filter((asset) => ['Cinematic Hits', 'Whooshes', 'Transitions', 'UI Sounds'].includes(asset.category))}
                    onPreview={playAssetPreview}
                    onAdd={addAssetToTrack}
                  />
                </>
              )}

              {activeSection === 'music' && (
                <>
                  <PanelHeader title="Music library" detail="Beds, ambience, and background loops" />
                  <LibraryList
                    items={project.assets.filter((asset) => ['Background Music', 'Ambience', 'Imported Audio', 'Recorded Voice', 'Voice'].includes(asset.category))}
                    onPreview={playAssetPreview}
                    onAdd={(asset) => addAssetToTrack(asset, project.tracks[1]?.id)}
                  />
                </>
              )}

              {activeSection === 'voice-tools' && (
                <>
                  <PanelHeader title="AI voice tools" detail="Create cleaner derived results without replacing the source" />
                  <div className="audio-tool-grid">
                    {aiTools.map((tool) => (
                      <button key={tool.id} className={`audio-tool-card ${tool.applied ? 'is-applied' : ''}`} type="button" onClick={() => runAiTool(tool.id)} disabled={tool.processing}>
                        <strong>{tool.name}</strong>
                        <small>{tool.processing ? 'Processing…' : tool.description}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {activeSection === 'cleanup' && (
                <>
                  <PanelHeader title="Cleanup tools" detail="One-click cleanup actions with visible status" />
                  <div className="audio-tool-grid">
                    {processingCleanup.map((tool) => (
                      <button key={tool.id} className={`audio-tool-card ${tool.applied ? 'is-applied' : ''}`} type="button" onClick={() => applyCleanupTool(tool.id)} disabled={tool.processing}>
                        <strong>{tool.name}</strong>
                        <small>{tool.processing ? 'Processing…' : tool.description}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {activeSection === 'effects' && (
                <>
                  <PanelHeader title="Effects rack" detail="Enable racks and shape the sound live" />
                  <div className="audio-effects-stack">
                    {project.effects.map((effect) => (
                      <div key={effect.id} className="audio-effect-row">
                        <button className={`audio-toggle ${effect.enabled ? 'is-on' : ''}`} type="button" onClick={() => mutateProject(`Toggled ${effect.name}`, (current) => ({ ...current, effects: current.effects.map((item) => item.id === effect.id ? { ...item, enabled: !item.enabled } : item) }))}>{effect.enabled ? 'On' : 'Off'}</button>
                        <div>
                          <strong>{effect.name}</strong>
                          <small>Amount {effect.amount}%</small>
                        </div>
                        <input type="range" min={0} max={100} value={effect.amount} onChange={(event) => mutateProject(`Adjusted ${effect.name}`, (current) => ({ ...current, effects: current.effects.map((item) => item.id === effect.id ? { ...item, amount: Number(event.target.value) } : item) }))} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeSection === 'export' && (
                <>
                  <PanelHeader title="Export presets" detail="Quick delivery setups for creator workflows" />
                  <div className="audio-export-preset-list">
                    {exportPresets.map((preset) => (
                      <button key={preset.id} className="audio-preset-card" type="button" onClick={() => setShowExportModal(true)}>
                        <strong>{preset.label}</strong>
                        <small>{preset.sampleRate} • {preset.quality}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>

          <section className="audio-workspace">
            <div className="audio-wave-toolbar">
              <div className="audio-wave-toolbar-left">
                <button className="secondary-button" type="button" onClick={() => setProject((current) => ({ ...current, zoom: Math.max(0.65, current.zoom - 0.1) }))}><ZoomOut size={15} /> Zoom out</button>
                <button className="secondary-button" type="button" onClick={() => setProject((current) => ({ ...current, zoom: Math.min(2.8, current.zoom + 0.1) }))}><ZoomIn size={15} /> Zoom in</button>
                <button className="secondary-button" type="button" onClick={() => setPlayhead(0)}>Fit to start</button>
                <button className="secondary-button" type="button" onClick={splitSelectedClip}><Scissors size={15} /> Split</button>
              </div>
              <div className="audio-wave-toolbar-right">
                <span className="audio-status-pill">{project.sampleRate}</span>
                <span className="audio-status-pill">{totalTracks} tracks</span>
                <span className="audio-status-pill">{autosaveStamp}</span>
              </div>
            </div>

            <div className={`audio-region-bar ${selectedRegion ? '' : 'is-empty'}`}>
              <strong>{selectedRegion ? 'Region selected' : 'Drag across the waveform to select a region'}</strong>
              <span>{selectedRegion ? `${formatTime(selectedRegion.start)} to ${formatTime(selectedRegion.end)} - ${(selectedRegion.end - selectedRegion.start).toFixed(2)}s` : 'Region export, trim previews, and focused cleanup start here.'}</span>
              {selectedRegion && <button className="secondary-button" type="button" onClick={() => setShowExportModal(true)}><Download size={15} /> Export region</button>}
              {selectedRegion && <button className="ghost-button" type="button" onClick={() => setProject((current) => ({ ...current, selectedRegion: null }))}>Clear</button>}
            </div>

            <div className="audio-ruler">
              {Array.from({ length: Math.ceil(projectDuration) + 1 }, (_, index) => (
                <button key={index} type="button" className="audio-ruler-mark" style={{ left: `${index * timeScale}px` }} onClick={() => setPlayhead(index)}>
                  <span>{formatTime(index).slice(0, 5)}</span>
                </button>
              ))}
            </div>

            <div
              className="audio-timeline-scroll"
              ref={timelineScrollerRef}
              onMouseDown={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const start = Math.max(0, (event.clientX - bounds.left + event.currentTarget.scrollLeft) / timeScale);
                setSelectionDraft({ start, end: start });
              }}
              onMouseMove={(event) => {
                if (!selectionDraft) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const end = Math.max(0, (event.clientX - bounds.left + event.currentTarget.scrollLeft) / timeScale);
                setSelectionDraft({ start: selectionDraft.start, end });
              }}
              onMouseUp={() => {
                if (!selectionDraft) return;
                const start = Math.min(selectionDraft.start, selectionDraft.end);
                const end = Math.max(selectionDraft.start, selectionDraft.end);
                setSelectionDraft(null);
                setProject((current) => ({ ...current, selectedRegion: end - start > 0.15 ? { start, end } : null }));
              }}
            >
              <div className="audio-timeline-content" style={{ width: `${Math.max(projectDuration * timeScale + 180, 1180)}px` }}>
                <canvas ref={waveformCanvasRef} className="audio-wave-canvas" />
                <div className="audio-track-lanes">
                  {project.tracks.map((track, trackIndex) => (
                    <div className="audio-track-lane" key={track.id} style={{ top: `${28 + trackIndex * 94}px` }}>
                      {track.clips.map((clip) => (
                        <button
                          key={clip.id}
                          type="button"
                          className={`audio-clip-block ${clip.id === selectedClipId ? 'is-selected' : ''}`}
                          style={{ left: `${clip.start * timeScale}px`, width: `${Math.max(64, clip.duration * timeScale)}px`, borderColor: track.color, background: `${track.color}2e` }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedClipId(clip.id);
                            setProject((current) => ({ ...current, selectedClipId: clip.id, selectedTrackId: track.id }));
                          }}
                        >
                          <i className="audio-clip-trim left" />
                          <span>{clip.name}</span>
                          <small>{clip.duration.toFixed(1)}s</small>
                          <i className="audio-clip-trim right" />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="audio-transport">
              <div className="audio-transport-buttons">
                <button className="icon-button" type="button" onClick={() => setPlayhead(Math.max(0, playhead - 1.5))}><Rewind size={16} /></button>
                <button className="primary-button" type="button" onClick={togglePlayback}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}{isPlaying ? 'Pause' : 'Play'}</button>
                <button className="icon-button" type="button" onClick={stopPlayback}><Square size={16} /></button>
                <button className="icon-button" type="button" onClick={() => setPlayhead(Math.min(projectDuration, playhead + 1.5))}><FastForward size={16} /></button>
                <button className={`secondary-button ${recording ? 'recording-active' : ''}`} type="button" onClick={() => (recording ? stopRecording() : void startRecording())}><Mic size={16} /> {recording ? 'Stop record' : 'Record'}</button>
                <button className={`secondary-button ${project.loop ? 'is-active' : ''}`} type="button" onClick={() => setProject((current) => ({ ...current, loop: !current.loop }))}><Repeat size={16} /> Loop</button>
              </div>
              <div className="audio-transport-meta">
                <strong>{formatTime(playhead)}</strong>
                <span>/ {formatTime(projectDuration)}</span>
                <select value={project.playbackRate} onChange={(event) => setProject((current) => ({ ...current, playbackRate: Number(event.target.value) }))}>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                </select>
              </div>
            </div>

            <div className="audio-mixer">
              {project.tracks.map((track, index) => (
                <article className="audio-mixer-track" key={track.id}>
                  <header>
                    <i style={{ background: track.color }} />
                    <strong>{track.name}</strong>
                    <small>{track.clips.length} clips</small>
                  </header>
                  <div className="audio-mixer-actions">
                    <button className={`audio-toggle ${track.mute ? 'is-on' : ''}`} type="button" onClick={() => updateTrack(track.id, (current) => ({ ...current, mute: !current.mute }), `${track.name} mute toggled`)}>Mute</button>
                    <button className={`audio-toggle ${track.solo ? 'is-on' : ''}`} type="button" onClick={() => updateTrack(track.id, (current) => ({ ...current, solo: !current.solo }), `${track.name} solo toggled`)}>Solo</button>
                    <button className={`audio-toggle ${track.locked ? 'is-on' : ''}`} type="button" onClick={() => updateTrack(track.id, (current) => ({ ...current, locked: !current.locked }), `${track.name} lock toggled`)}>Lock</button>
                  </div>
                  <input type="range" min={0} max={120} value={track.volume * 100} onChange={(event) => updateTrack(track.id, (current) => ({ ...current, volume: Number(event.target.value) / 100 }), `${track.name} volume adjusted`)} />
                  <div className="audio-level-meter">
                    <i style={{ width: `${levelMeterValues[index] * 100}%`, background: track.color }} />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="audio-right-panel">
            <section className="audio-panel-card">
              <PanelHeader title="Clip properties" detail={selectedClip ? selectedClip.name : 'Select a clip'} />
              {selectedClip && selectedAsset ? (
                <div className="audio-property-stack">
                  <label><span>Clip name</span><input value={selectedClip.name} onChange={(event) => updateSelectedClip((clip) => ({ ...clip, name: event.target.value }), 'Renamed clip')} /></label>
                  <label><span>Volume</span><input type="range" min={0} max={120} value={selectedClip.volume * 100} onChange={(event) => updateSelectedClip((clip) => ({ ...clip, volume: Number(event.target.value) / 100 }), 'Adjusted clip volume')} /></label>
                  <label><span>Pan</span><input type="range" min={-100} max={100} value={selectedClip.pan * 100} onChange={(event) => updateSelectedClip((clip) => ({ ...clip, pan: Number(event.target.value) / 100 }), 'Adjusted clip pan')} /></label>
                  <label><span>Fade in</span><input type="range" min={0} max={2.5} step={0.01} value={selectedClip.fadeIn} onChange={(event) => updateSelectedClip((clip) => ({ ...clip, fadeIn: Number(event.target.value) }), 'Adjusted fade in')} /></label>
                  <label><span>Fade out</span><input type="range" min={0} max={2.5} step={0.01} value={selectedClip.fadeOut} onChange={(event) => updateSelectedClip((clip) => ({ ...clip, fadeOut: Number(event.target.value) }), 'Adjusted fade out')} /></label>
                  <label><span>Pitch</span><input type="range" min={-12} max={12} step={1} value={selectedClip.pitch} onChange={(event) => updateSelectedClip((clip) => ({ ...clip, pitch: Number(event.target.value) }), 'Adjusted pitch')} /></label>
                  <label><span>Speed</span><input type="range" min={0.5} max={2} step={0.05} value={selectedClip.speed} onChange={(event) => updateSelectedClip((clip) => ({ ...clip, speed: Number(event.target.value) }), 'Adjusted speed')} /></label>
                  <div className="audio-inline-actions">
                    <button className="secondary-button" type="button" onClick={normalizeSelected}>Normalize</button>
                    <button className="secondary-button" type="button" onClick={reverseSelected}>Reverse</button>
                    <button className="secondary-button" type="button" onClick={duplicateSelectedClip}>Duplicate</button>
                    <button className="danger-button" type="button" onClick={deleteSelectedClip}>Delete</button>
                  </div>
                  <small>{selectedAsset.format} • {selectedAsset.duration.toFixed(1)}s • {selectedTrack?.name}</small>
                </div>
              ) : (
                <div className="audio-empty-state">Drop or add an audio clip to start editing its properties.</div>
              )}
            </section>

            <section className="audio-panel-card">
              <PanelHeader title="Equalizer" detail="8 band quick shaping" />
              <div className="audio-eq-grid">
                {Object.entries(project.eqBands).map(([band, value]) => (
                  <label key={band} className="audio-eq-band">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={value}
                      onChange={(event) => mutateProject(`Adjusted ${band}`, (current) => ({ ...current, eqBands: { ...current.eqBands, [band]: Number(event.target.value) } }))}
                    />
                    <strong>{band}</strong>
                    <small>{value > 0 ? '+' : ''}{value} dB</small>
                  </label>
                ))}
              </div>
            </section>

            <section className="audio-panel-card">
              <PanelHeader title="History" detail="Recent actions in this project" />
              <div className="audio-history-list">
                {project.history.map((entry) => (
                  <article key={entry.id}>
                    <strong>{entry.label}</strong>
                    <small>{new Date(entry.createdAt).toLocaleTimeString()}</small>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <footer className="audio-statusbar">
          <span>{project.sampleRate} • {projectDuration.toFixed(1)}s • {project.tracks.length} tracks</span>
          <span>{selectedRegion ? `Selected region ${formatTime(selectedRegion.start)} - ${formatTime(selectedRegion.end)}` : selectedClip ? `Selected clip: ${selectedClip.name}` : 'No active selection'}</span>
          <span>Zoom {Math.round(project.zoom * 100)}%</span>
        </footer>
      </div>

      {showExportModal && (
        <AudioExportModal
          project={project}
          onClose={() => setShowExportModal(false)}
          pushToast={pushToast}
          bufferCache={audioBufferCacheRef.current}
          assets={project.assets}
        />
      )}

      {showShortcuts && (
        <AudioShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {showSettings && (
        <div className="modal-scrim">
          <section className="modal audio-settings-modal">
            <header className="modal-header">
              <div>
                <span className="modal-eyebrow">Audio Editor settings</span>
                <h2>Workspace settings</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowSettings(false)}><Square size={14} /></button>
            </header>
            <div className="audio-settings-grid">
              <button className={`audio-settings-card ${theme === 'dark' ? 'is-active' : ''}`} type="button" onClick={() => setThemeAndToast('dark')}>
                <strong>Dark mode</strong>
                <small>Premium default look for Edify.</small>
              </button>
              <button className={`audio-settings-card ${theme === 'light' ? 'is-active' : ''}`} type="button" onClick={() => setThemeAndToast('light')}>
                <strong>Light mode</strong>
                <small>Brighter look for editing and review.</small>
              </button>
              <button className={`audio-settings-card ${fullscreenPreview ? 'is-active' : ''}`} type="button" onClick={() => setFullscreenPreview((current) => !current)}>
                <strong>Preview mode</strong>
                <small>{fullscreenPreview ? 'Return to full workspace layout.' : 'Reduce chrome and focus on the waveform.'}</small>
              </button>
              <button className="audio-settings-card" type="button" onClick={() => setShowShortcuts(true)}>
                <strong>Keyboard shortcuts</strong>
                <small>Open the full shortcut reference modal.</small>
              </button>
            </div>
          </section>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  );

  function playAssetPreview(asset: AudioEditorAsset) {
    const audio = new Audio(asset.previewUrl);
    audio.volume = 0.78;
    void audio.play().catch(() => {
      pushToast({ title: 'Preview blocked', detail: 'Click again or check your output device.', tone: 'warning' });
    });
  }
}

function PanelHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="audio-panel-header">
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  );
}

function SidebarButton({ label, active, icon, onClick }: { label: string; active?: boolean; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`audio-sidebar-button ${active ? 'is-active' : ''}`} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function LibraryList({
  items,
  onPreview,
  onAdd
}: {
  items: AudioEditorAsset[];
  onPreview: (asset: AudioEditorAsset) => void;
  onAdd: (asset: AudioEditorAsset) => void;
}) {
  return (
    <div className="audio-library-list">
      {items.map((asset) => (
        <article key={asset.id} className="audio-library-card">
          <div>
            <strong>{asset.name}</strong>
            <small>{asset.category} • {asset.duration.toFixed(1)}s</small>
          </div>
          <div className="audio-inline-actions">
            <button className="secondary-button" type="button" onClick={() => onPreview(asset)}><Play size={14} /> Preview</button>
            <button className="secondary-button" type="button" onClick={() => onAdd(asset)}><ListMusic size={14} /> Add</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function AudioShortcutsModal({ onClose }: { onClose: () => void }) {
  const groups = [
    ['Playback', [['Space', 'Play / Pause'], ['R', 'Record / Stop recording'], ['S', 'Split selected clip']]],
    ['Edit', [['Delete', 'Delete selected clip'], ['Ctrl+S', 'Save project'], ['Ctrl+Shift+S', 'Save as']]],
    ['History', [['Ctrl+Z', 'Undo'], ['Ctrl+Y / Ctrl+Shift+Z', 'Redo']]],
    ['View', [['[', 'Zoom out timeline'], [']', 'Zoom in timeline']]]
  ] as const;

  return (
    <div className="modal-scrim">
      <section className="modal audio-shortcuts-modal">
        <header className="modal-header">
          <div>
            <span className="modal-eyebrow">Keyboard</span>
            <h2>Audio Editor shortcuts</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}><Square size={14} /></button>
        </header>
        <div className="audio-shortcuts-scroll">
          <div className="audio-shortcuts-grid">
            {groups.map(([title, shortcuts]) => (
              <article className="audio-shortcut-card" key={title}>
                <strong>{title}</strong>
                {shortcuts.map(([keys, label]) => (
                  <div className="audio-shortcut-row" key={keys}>
                    <kbd>{keys}</kbd>
                    <span>{label}</span>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AudioExportModal({
  project,
  assets,
  bufferCache,
  pushToast,
  onClose
}: {
  project: AudioEditorProject;
  assets: AudioEditorAsset[];
  bufferCache: Map<string, AudioBuffer>;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState(project.name);
  const [format, setFormat] = useState<AudioEditorExportFormat>('wav');
  const [quality, setQuality] = useState<AudioEditorQuality>('High');
  const [sampleRate, setSampleRate] = useState<'44.1kHz' | '48kHz'>(project.sampleRate);
  const [bitrate, setBitrate] = useState<'128kbps' | '192kbps' | '320kbps'>('320kbps');
  const [range, setRange] = useState<'entire' | 'selected'>(project.selectedRegion ? 'selected' : 'entire');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setMessage(null);
    setProgress(12);
    try {
      const renderProject = {
        ...project,
        selectedRegion: range === 'selected' ? project.selectedRegion : null
      };
      const offlineBuffer = await renderProjectAudio(renderProject, assets, sampleRate === '48kHz' ? 48000 : 44100, bufferCache);
      setProgress(74);
      const wavBuffer = encodeWav(offlineBuffer);
      setProgress(92);
      const exportExtension = 'wav';
      const result = await edifyApi.saveAudioEditorBinary({
        suggestedName: fileName.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Audio Export',
        extension: exportExtension,
        mimeType: 'audio/wav',
        buffer: wavBuffer
      });
      setProgress(100);
      if (!result?.canceled) {
        const detail = format === 'wav'
          ? `Saved ${result.filePath}`
          : `Saved a WAV master while ${format.toUpperCase()} encoding is prepared for a later renderer update.`;
        setMessage(detail);
        pushToast({ title: 'Export completed', detail, tone: 'success' });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Audio export failed.';
      setMessage(detail);
      pushToast({ title: 'Export failed', detail, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim">
      <section className="modal audio-export-modal">
        <header className="modal-header">
          <div>
            <span className="modal-eyebrow">Export</span>
            <h2>Audio export</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}><Square size={14} /></button>
        </header>
        <div className="audio-export-grid">
          <label><span>File name</span><input value={fileName} onChange={(event) => setFileName(event.target.value)} /></label>
          <label><span>Format</span><select value={format} onChange={(event) => setFormat(event.target.value as AudioEditorExportFormat)}><option value="mp3">MP3</option><option value="wav">WAV</option><option value="ogg">OGG</option><option value="aac">AAC</option></select></label>
          <label><span>Quality</span><select value={quality} onChange={(event) => setQuality(event.target.value as AudioEditorQuality)}><option>Low</option><option>Medium</option><option>High</option><option>Lossless</option></select></label>
          <label><span>Sample rate</span><select value={sampleRate} onChange={(event) => setSampleRate(event.target.value as '44.1kHz' | '48kHz')}><option>44.1kHz</option><option>48kHz</option></select></label>
          <label><span>Bitrate</span><select value={bitrate} onChange={(event) => setBitrate(event.target.value as '128kbps' | '192kbps' | '320kbps')}><option>128kbps</option><option>192kbps</option><option>320kbps</option></select></label>
          <label><span>Export range</span><select value={range} onChange={(event) => setRange(event.target.value as 'entire' | 'selected')}><option value="entire">Entire project</option><option value="selected">Selected region</option></select></label>
        </div>
        <div className="audio-export-summary">
          <article>
            <strong>{range === 'selected' && project.selectedRegion ? `${(project.selectedRegion.end - project.selectedRegion.start).toFixed(2)}s region` : `${project.duration.toFixed(2)}s project`}</strong>
            <small>{range === 'selected' ? 'Only the highlighted timeline region will render.' : 'Every visible track in the project will render.'}</small>
          </article>
          <article>
            <strong>{sampleRate} / {bitrate}</strong>
            <small>Current desktop renderer writes a clean WAV master for reliable playback.</small>
          </article>
        </div>
        <div className="audio-export-progress">
          <div className="audio-export-progress-bar"><i style={{ width: `${progress}%` }} /></div>
          <strong>{busy ? `${progress}%` : message ?? 'Ready to export'}</strong>
        </div>
        <div className="dialog-actions">
          <button className="ghost-button" type="button" onClick={onClose}>Close</button>
          <button className="primary-button" type="button" onClick={() => void handleExport()} disabled={busy}>Export audio</button>
        </div>
      </section>
    </div>
  );
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
