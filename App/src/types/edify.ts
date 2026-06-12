export type MediaKind = 'video' | 'audio' | 'image' | 'generated' | 'unknown';

export type TrackKind = 'video' | 'audio' | 'text' | 'overlay';

export type ClipKind = 'video' | 'audio' | 'image' | 'text' | 'effect' | 'transition';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'autosaved' | 'offline';

export type PanelId =
  | 'suite'
  | 'media'
  | 'favorites'
  | 'quick'
  | 'ai'
  | 'assistant'
  | 'moderation'
  | 'render'
  | 'audio'
  | 'voice'
  | 'sounds'
  | 'text'
  | 'effects'
  | 'transitions'
  | 'filters'
  | 'stickers'
  | 'templates'
  | 'captions'
  | 'premium'
  | 'marketplace'
  | 'color'
  | 'assets';

export type AppSettings = {
  uiScale: number;
  previewQuality: 'Full' | 'Half' | 'Quarter';
  hardwareAcceleration: boolean;
  autosaveMinutes: number;
};

export type ProjectSettings = {
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5' | '21:9';
  backgroundColor: string;
  sampleRate: 44100 | 48000;
};

export type MediaAsset = {
  id: string;
  name: string;
  kind: MediaKind;
  path: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  size?: number;
  extension?: string;
  duration?: number;
  importedAt: string;
  dimensions?: {
    width: number;
    height: number;
  };
  waveform?: number[];
  category?: string;
  favorite?: boolean;
  missing?: boolean;
};

export type EffectInstance = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  intensity: number;
};

export type Keyframe = {
  id: string;
  time: number;
  property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume';
  value: number;
};

export type Clip = {
  id: string;
  assetId?: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  start: number;
  duration: number;
  inPoint: number;
  color: string;
  linkedClipId?: string;
  selected?: boolean;
  locked?: boolean;
  text?: string;
  transition?: {
    style: string;
    easing: string;
    duration?: number;
    placement?: 'start' | 'center' | 'end';
    at?: number;
  };
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
  };
  audio: {
    volume: number;
    fadeIn: number;
    fadeOut: number;
    pitch: number;
    denoise: number;
  };
  effects: EffectInstance[];
  keyframes: Keyframe[];
};

export type Track = {
  id: string;
  name: string;
  kind: TrackKind;
  height: number;
  muted?: boolean;
  locked?: boolean;
  hidden?: boolean;
  color: string;
  clips: Clip[];
};

export type TimelineMarker = {
  id: string;
  time: number;
  label: string;
  color: string;
  note?: string;
};

export type ProjectDocument = {
  id: string;
  name: string;
  path?: string;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  assets: MediaAsset[];
  tracks: Track[];
  markers: TimelineMarker[];
  notes: string;
  duration: number;
  version: 1;
};

export type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  updatedAt: string;
  thumbnail?: string;
  source?: 'local' | 'cloud';
};

export type BootstrapInfo = {
  appVersion: string;
  platform: string;
  paths: {
    projects: string;
    cache: string;
    userData: string;
    autosave: string;
  };
  settings: AppSettings;
  recentProjects: ProjectSummary[];
  recoveryAvailable: boolean;
  consentAccepted: boolean;
};

export type ExportPreset = {
  id: string;
  label: string;
  resolution: string;
  bitrate: string;
  fps: number;
  quality: 'Low' | 'Medium' | 'High' | 'Ultra';
};

export type Toast = {
  id: string;
  title: string;
  detail?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
};

export type DesktopAccountProvider = 'google' | 'github' | 'microsoft';

export type DesktopAccountUser = {
  id: string;
  name: string;
  email: string;
  provider: DesktopAccountProvider;
};
