import {
  AudioLines,
  BadgePlus,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Captions,
  Clapperboard,
  CircleUserRound,
  Crown,
  Cpu,
  FileVideo,
  FolderKanban,
  Gauge,
  Gift,
  ImagePlus,
  Layers,
  Mic2,
  Music2,
  Play,
  Palette,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Stars,
  Subtitles,
  Trash2,
  Wand2,
  type LucideIcon
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PremiumOfferModal } from '../modals/PremiumOfferModal';
import { SponsoredUnlockModal } from '../modals/SponsoredUnlockModal';
import { formatBytes } from '../../lib/format';
import { createGeneratedSoundAsset, createWaveformForName } from '../../lib/generatedAudio';
import { allProjectClips, cleanSensitiveText, scanProject } from '../../lib/moderation';
import { creatorEssentialsPresets, effectPresets, filterPresets, premiumCaptionPresets, premiumEffectPresets, premiumFilterPresets, premiumTextAnimationPresets, premiumTextPresets, premiumTransitionPresets, textAnimationPresets, textPresets, transitionPresets } from '../../lib/presets';
import type { PremiumEffectPreset } from '../../lib/presets';
import {
  activeRewardUnlocks,
  canStartSponsoredUnlockToday,
  getPendingSponsoredClaim,
  getRewardHistory,
  getSponsorSeriesProgress,
  hasAnyPremium,
  hasRewardItem,
  loadPremiumAccess,
  rewardItemNames,
  rewardTimeRemaining,
  type PremiumAccess
} from '../../lib/premium';
import type { Clip, DesktopAccountUser, MediaAsset, PanelId, ProjectDocument, Toast } from '../../types/edify';

type SidebarProps = {
  activePanel: string;
  onPanelChange: (panel: string) => void;
  project: ProjectDocument;
  selectedClip?: Clip;
  accountUser?: DesktopAccountUser | null;
  onOpenAccount: () => void;
  onImportMedia: () => void;
  onAddText: (preset?: string, start?: number, trackId?: string, content?: string, duration?: number) => void;
  onAddEffect: (name: string) => void;
  onAddTransition: (name: string) => void;
  onAddClip: (asset: MediaAsset) => void;
  onUpdateClip: (clipId: string, updater: (clip: Clip) => Clip) => void;
  onDeleteAsset: (assetId: string) => void;
  onExport: () => void;
  onRecordVoice: () => void;
  isRecordingVoice: boolean;
  onMagicEdit: (style: 'cinematic' | 'gaming' | 'creator' | 'podcast' | 'travel' | 'luxury') => void;
  onBeatSync: () => void;
  onApplyVideoTemplate: (template: 'shorts' | 'gaming' | 'product' | 'trailer' | 'podcast' | 'travel' | 'fashion' | 'reaction' | 'music' | 'tutorial' | 'real-estate' | 'launch') => void;
  onStudioFeature: (featureId: string) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
};

const sections: Array<{ id: PanelId; label: string; icon: LucideIcon }> = [
  { id: 'suite', label: '0.2 Hub', icon: Stars },
  { id: 'media', label: 'Media', icon: Clapperboard },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'quick', label: 'Quick', icon: Rocket },
  { id: 'ai', label: 'AI Tools', icon: Bot },
  { id: 'assistant', label: 'Assistant', icon: BrainCircuit },
  { id: 'moderation', label: 'Review', icon: ShieldCheck },
  { id: 'render', label: 'Render', icon: Cpu },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'voice', label: 'Voice', icon: Mic2 },
  { id: 'sounds', label: 'Sounds', icon: Music2 },
  { id: 'text', label: 'Text', icon: Subtitles },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'premium', label: 'Premium', icon: Crown },
  { id: 'marketplace', label: 'Store', icon: ShoppingBag },
  { id: 'transitions', label: 'Transitions', icon: Wand2 },
  { id: 'filters', label: 'Filters', icon: Palette },
  { id: 'stickers', label: 'Stickers', icon: ImagePlus },
  { id: 'templates', label: 'Templates', icon: Layers },
  { id: 'captions', label: 'Captions', icon: Captions },
  { id: 'color', label: 'Color', icon: Stars },
  { id: 'assets', label: 'Assets', icon: FolderKanban }
];

const quickModes = [
  {
    name: 'Cinematic One Tap',
    detail: 'Cool tone, glow, title, and a polished opener.',
    effects: ['Cinematic Cool Tone', 'Glow', 'Vignette'],
    text: 'Cinematic Title'
  },
  {
    name: 'Gaming Edit',
    detail: 'Punchy color, shake, zoom, and highlight text.',
    effects: ['Gaming Highlight', 'Shake', 'Zoom Punch'],
    text: 'Gaming edit text'
  },
  {
    name: 'Clean Creator',
    detail: 'Soft film finish with subtitles ready for socials.',
    effects: ['Soft Film', 'Contrast Boost', 'Saturation Boost'],
    text: 'Subtitle'
  },
  {
    name: 'Quick Montage',
    detail: 'Beat-cut structure with flash and whip energy.',
    effects: ['Flash transition', 'Whip transition', 'Flicker'],
    text: 'Lower third'
  }
];

const aiTools = [
  { name: 'Auto subtitles', detail: 'Create editable subtitle clips from speech or transcript.', action: 'captions', premium: false },
  { name: 'Beat cut helper', detail: 'Places timing markers and montage-ready rhythm cues.', action: 'beat', premium: false },
  { name: 'Enhance voice', detail: 'Adds denoise and studio clarity to the selected audio/video.', action: 'voice', premium: true },
  { name: 'Remove silence', detail: 'Prepares smart cuts around empty audio sections.', action: 'silence', premium: true },
  { name: 'Background blur', detail: 'Portrait-to-landscape blur treatment for vertical footage.', action: 'background', premium: true },
  { name: 'Premium upscale', detail: 'Sharpen, glow, and premium export guidance.', action: 'upscale', premium: true },
  { name: 'Smart montage builder', detail: 'Adds title, rhythm effects, and fast transition structure.', action: 'montage', premium: true },
  { name: 'Auto hook opener', detail: 'Creates a bold intro title and first-second punch effects.', action: 'hook', premium: true },
  { name: 'Color match AI', detail: 'Applies a clean matched grade to the selected clip.', action: 'color-match', premium: true },
  { name: 'B-roll finder', detail: 'Prepares overlay/title placeholders for missing visual beats.', action: 'broll', premium: true },
  { name: 'Caption style AI', detail: 'Turns plain subtitles into animated creator captions.', action: 'caption-style', premium: true },
  { name: 'Motion focus', detail: 'Adds zoom, glow, and shake emphasis to the selected moment.', action: 'motion-focus', premium: true },
  { name: 'Clean product shot', detail: 'Adds premium shine, HDR clarity, and soft background depth.', action: 'product', premium: true }
];

const soundItems = [
  { name: 'Whoosh Sweep', duration: 1.2, tag: 'Transition' },
  { name: 'Deep Impact', duration: 1.8, tag: 'Hit' },
  { name: 'Neon Riser', duration: 2.4, tag: 'Build' },
  { name: 'Glitch Hit', duration: 0.9, tag: 'Gaming' },
  { name: 'Soft Camera Click', duration: 0.4, tag: 'UI' },
  { name: 'Cinematic Ambience', duration: 8, tag: 'Bed' },
  { name: 'Chill Bedroom Pop', duration: 14, tag: 'Chill' },
  { name: 'LoFi Cozy Clouds', duration: 16, tag: 'Chill' },
  { name: 'Soft Sunset Guitar', duration: 14, tag: 'Chill' },
  { name: 'Coffee Shop Loop', duration: 16, tag: 'Chill' },
  { name: 'Dreamy Creator Pop', duration: 12, tag: 'Chill' },
  { name: 'Warm Sunday Vlog', duration: 14, tag: 'Chill' },
  { name: 'Cloudy Day Beat', duration: 14, tag: 'Chill' },
  { name: 'Gentle Piano Vlog', duration: 16, tag: 'Chill' },
  { name: 'Happy Soft Ukulele', duration: 12, tag: 'Chill' },
  { name: 'Clean Morning Loop', duration: 14, tag: 'Chill' },
  { name: 'Aesthetic Study Pop', duration: 16, tag: 'Chill' },
  { name: 'Soft Fashion Lounge', duration: 14, tag: 'Chill' },
  { name: 'Sunny Travel Breeze', duration: 16, tag: 'Chill' },
  { name: 'Minimal Creator Bed', duration: 14, tag: 'Chill' },
  { name: 'LoFi Rain Window', duration: 16, tag: 'Chill' },
  { name: 'Cute Daily Routine', duration: 12, tag: 'Chill' },
  { name: 'Dream Pop Montage', duration: 14, tag: 'Chill' },
  { name: 'Cozy Night Desk', duration: 16, tag: 'Chill' },
  { name: 'Soft Cloud Ambient', duration: 16, tag: 'Chill' },
  { name: 'Creator Chill Groove', duration: 14, tag: 'Chill' },
  { name: 'Cinematic Pulse Loop', duration: 12, tag: 'Music' },
  { name: 'Epic Trailer Rise', duration: 10, tag: 'Music' },
  { name: 'Soft Tension Bed', duration: 12, tag: 'Music' },
  { name: 'Hero Reveal Loop', duration: 9, tag: 'Music' },
  { name: 'Emotional Piano Glow', duration: 12, tag: 'Music' },
  { name: 'Luxury Fashion Pulse', duration: 10, tag: 'Music' },
  { name: 'Neon Cyber Chase', duration: 12, tag: 'Music' },
  { name: 'Gaming Highlight Beat', duration: 8, tag: 'Music' },
  { name: 'Trap Edit Bounce', duration: 8, tag: 'Music' },
  { name: 'Drill Switch Beat', duration: 8, tag: 'Music' },
  { name: 'Hyperpop Spark Loop', duration: 8, tag: 'Music' },
  { name: 'Glitch Arcade Groove', duration: 8, tag: 'Music' },
  { name: 'Victory Screen Beat', duration: 8, tag: 'Music' },
  { name: 'LoFi Night Drive', duration: 12, tag: 'Music' },
  { name: 'Chill Creator Loop', duration: 12, tag: 'Music' },
  { name: 'Soft Study Beat', duration: 12, tag: 'Music' },
  { name: 'Rainy City Pad', duration: 14, tag: 'Music' },
  { name: 'Warm Vlog Groove', duration: 10, tag: 'Music' },
  { name: 'Morning Routine Pop', duration: 10, tag: 'Music' },
  { name: 'Travel Montage Beat', duration: 12, tag: 'Music' },
  { name: 'Beach Creator Pop', duration: 10, tag: 'Music' },
  { name: 'Workout Drive Loop', duration: 8, tag: 'Music' },
  { name: 'House Clean Loop', duration: 8, tag: 'Music' },
  { name: 'Deep House Night', duration: 10, tag: 'Music' },
  { name: 'Future Bass Lift', duration: 8, tag: 'Music' },
  { name: 'Synthwave Road', duration: 12, tag: 'Music' },
  { name: 'Retro Wave Grid', duration: 10, tag: 'Music' },
  { name: 'Podcast Intro Clean', duration: 7, tag: 'Music' },
  { name: 'News Tension Bed', duration: 10, tag: 'Music' },
  { name: 'Documentary Minimal', duration: 14, tag: 'Music' },
  { name: 'Minimal Ambient Drone', duration: 12, tag: 'Music' },
  { name: 'Calm Ambient Space', duration: 14, tag: 'Music' },
  { name: 'Meditation Soft Pad', duration: 14, tag: 'Music' },
  { name: 'Product Launch Pulse', duration: 10, tag: 'Music' },
  { name: 'Tech Startup Loop', duration: 10, tag: 'Music' },
  { name: 'Clean Corporate Bed', duration: 12, tag: 'Music' },
  { name: 'Cute Pop Bumper', duration: 6, tag: 'Music' },
  { name: 'Kinetic Subtitle Beat', duration: 8, tag: 'Music' },
  { name: 'Cinematic End Card', duration: 8, tag: 'Music' },
  { name: 'Bass Drop Short', duration: 3, tag: 'Drop' },
  { name: 'Flash Hit Bright', duration: 0.8, tag: 'Hit' },
  { name: 'Soft Logo Chime', duration: 2, tag: 'Logo' },
  { name: 'Premium Logo Bloom', duration: 2.8, tag: 'Logo' },
  { name: 'Golden Hour Lounge', duration: 14, tag: 'Chill' },
  { name: 'Soft Rooftop Sunset', duration: 14, tag: 'Chill' },
  { name: 'Lavender Night Pop', duration: 12, tag: 'Chill' },
  { name: 'Snowy Study Lights', duration: 16, tag: 'Chill' },
  { name: 'After Class Groove', duration: 14, tag: 'Chill' },
  { name: 'Warm Coffee Vinyl', duration: 16, tag: 'Chill' },
  { name: 'Creator Chill Sunset', duration: 14, tag: 'Chill' },
  { name: 'Dreamy Window Light', duration: 16, tag: 'Chill' },
  { name: 'Velvet Fashion Pad', duration: 14, tag: 'Chill' },
  { name: 'Late Night Creator Pop', duration: 12, tag: 'Chill' },
  { name: 'Clean Soft Reels', duration: 12, tag: 'Chill' },
  { name: 'Pastel Routine Loop', duration: 14, tag: 'Chill' },
  { name: 'Minimal Daily Glow', duration: 12, tag: 'Chill' },
  { name: 'Beach Walk LoFi', duration: 16, tag: 'Chill' },
  { name: 'Skincare Day Groove', duration: 14, tag: 'Chill' },
  { name: 'Airy Home Vlog', duration: 14, tag: 'Chill' },
  { name: 'Studio Lamp Mood', duration: 16, tag: 'Chill' },
  { name: 'Creator Cozy Night', duration: 16, tag: 'Chill' },
  { name: 'Vintage Pop Soft', duration: 12, tag: 'Chill' },
  { name: 'Travel Chill Motion', duration: 14, tag: 'Chill' },
  { name: 'Crisp Fashion Pulse', duration: 10, tag: 'Music' },
  { name: 'Minimal Brand Glow', duration: 10, tag: 'Music' },
  { name: 'Soft Luxury Pulse', duration: 10, tag: 'Music' },
  { name: 'Calm Product Reveal', duration: 12, tag: 'Music' },
  { name: 'Daily Vlog Bounce', duration: 10, tag: 'Music' },
  { name: 'Bright Creator Intro', duration: 8, tag: 'Music' },
  { name: 'Podcast Clean Bed', duration: 12, tag: 'Music' },
  { name: 'Warm Interview Pad', duration: 12, tag: 'Music' },
  { name: 'Cinematic Story Pulse', duration: 12, tag: 'Music' },
  { name: 'Documentary Hope Bed', duration: 14, tag: 'Music' },
  { name: 'Luxury Reel Motion', duration: 10, tag: 'Music' },
  { name: 'Travel Open Road', duration: 12, tag: 'Music' },
  { name: 'Soft House Bounce', duration: 10, tag: 'Music' },
  { name: 'Summer Creator Bass', duration: 10, tag: 'Music' },
  { name: 'Airy Pop Horizon', duration: 12, tag: 'Music' },
  { name: 'Clean Startup Flow', duration: 10, tag: 'Music' },
  { name: 'Future Creator Spark', duration: 10, tag: 'Music' },
  { name: 'Motivation Soft Rise', duration: 12, tag: 'Music' },
  { name: 'Reaction Edit Bounce', duration: 8, tag: 'Music' },
  { name: 'Shorts Loop Bright', duration: 8, tag: 'Music' },
  { name: 'Vertical Reel Beat', duration: 8, tag: 'Music' },
  { name: 'Story Opener Pop', duration: 8, tag: 'Music' },
  { name: 'Flash Whoosh Clean', duration: 0.9, tag: 'Transition' },
  { name: 'Glass Swipe Air', duration: 1.2, tag: 'Transition' },
  { name: 'Film Burn Hit', duration: 1.4, tag: 'Transition' },
  { name: 'Impact Flash Pop', duration: 0.8, tag: 'Hit' },
  { name: 'Soft Click UI Pro', duration: 0.3, tag: 'UI' },
  { name: 'Luxury Drop Hit', duration: 1.1, tag: 'Hit' },
  { name: 'Bright Sweep Logo', duration: 1.8, tag: 'Logo' },
  { name: 'Crystal Brand Chime', duration: 2.1, tag: 'Logo' }
];

const premiumSoundItems = [
  { name: 'VIP Trailer Boom', duration: 2.2, tag: 'Premium Hit' },
  { name: 'Luxury Logo Reveal', duration: 3.2, tag: 'Premium Logo' },
  { name: 'Cinematic Whoosh Pro', duration: 1.4, tag: 'Premium Transition' },
  { name: 'Neon Impact Riser', duration: 3.8, tag: 'Premium Build' },
  { name: 'Creator Pop Sweep', duration: 1.1, tag: 'Premium UI' },
  { name: 'Gaming Victory Stinger', duration: 2.6, tag: 'Premium Gaming' },
  { name: 'Deep Bass Hit Pro', duration: 1.6, tag: 'Premium Hit' },
  { name: 'Soft Premium Chime', duration: 2.4, tag: 'Premium Logo' }
];

const stickerItems = [
  'Arrow Pop',
  'Circle Highlight',
  'Emoji Smile Pop',
  'Emoji Fire Reaction',
  'Emoji Heart Burst',
  'Emoji Shock Face',
  'Emoji Star Eyes',
  'Emoji Check Mark',
  'Image Polaroid Frame',
  'Image Screenshot Pin',
  'Image Product Glow',
  'Image Meme Label',
  'Subscribe Tag',
  'Like Burst',
  'New Drop Label',
  'Sale Spark',
  'Reaction Boom',
  'Verified Badge',
  'Neon Pointer',
  'Chat Bubble',
  'Warning Pulse',
  'Gaming KO',
  'Speed Lines Sticker',
  'Star Burst',
  'Heart Pop',
  'Cinematic Frame Label',
  'Creator Tag',
  'Swipe Up Marker',
  'Comment Bubble',
  'Limited Drop Badge'
];

function stickerContent(name: string) {
  const key = name.toLowerCase();
  if (key.includes('arrow')) return '➜';
  if (key.includes('circle')) return '○';
  if (key.includes('smile')) return '😊';
  if (key.includes('fire')) return '🔥';
  if (key.includes('heart')) return '❤️';
  if (key.includes('shock')) return '😱';
  if (key.includes('star eyes')) return '🤩';
  if (key.includes('check')) return '✓';
  if (key.includes('polaroid')) return '▧';
  if (key.includes('screenshot')) return '⌖';
  if (key.includes('product')) return '✦';
  if (key.includes('meme')) return 'MEME';
  if (key.includes('subscribe')) return 'SUBSCRIBE';
  if (key.includes('like')) return 'LIKE';
  if (key.includes('drop')) return 'NEW';
  if (key.includes('sale')) return 'SALE';
  if (key.includes('verified')) return '✓';
  if (key.includes('chat') || key.includes('comment')) return '💬';
  if (key.includes('warning')) return '!';
  if (key.includes('ko')) return 'KO';
  if (key.includes('speed')) return '≫';
  if (key.includes('star')) return '★';
  if (key.includes('frame')) return '▭';
  if (key.includes('tag')) return '#';
  if (key.includes('swipe')) return '↑';
  return name;
}

function stickerGlyphContent(name: string) {
  const key = name.toLowerCase();
  if (key.includes('arrow')) return '\u279c';
  if (key.includes('circle')) return '\u25cb';
  if (key.includes('smile')) return '\ud83d\ude0a';
  if (key.includes('fire')) return '\ud83d\udd25';
  if (key.includes('heart')) return '\u2764\ufe0f';
  if (key.includes('shock')) return '\ud83d\ude31';
  if (key.includes('star eyes')) return '\ud83e\udd29';
  if (key.includes('check')) return '\u2713';
  if (key.includes('polaroid')) return '\u25a7';
  if (key.includes('screenshot')) return '\u2316';
  if (key.includes('product')) return '\u2726';
  if (key.includes('meme')) return 'MEME';
  if (key.includes('subscribe')) return 'SUBSCRIBE';
  if (key.includes('like')) return 'LIKE';
  if (key.includes('drop')) return 'NEW';
  if (key.includes('sale')) return 'SALE';
  if (key.includes('verified')) return '\u2713';
  if (key.includes('chat') || key.includes('comment')) return '\ud83d\udcac';
  if (key.includes('warning')) return '!';
  if (key.includes('ko')) return 'KO';
  if (key.includes('speed')) return '\u226b';
  if (key.includes('star')) return '\u2605';
  if (key.includes('frame')) return '\u25ad';
  if (key.includes('tag')) return '#';
  if (key.includes('swipe')) return '\u2191';
  return name;
}

const magicEditStyles = [
  { id: 'cinematic' as const, name: 'Cinematic Magic', detail: 'Trailer pacing, film burn, luma dissolves, wide format.' },
  { id: 'gaming' as const, name: 'Gaming Magic', detail: 'Fast beats, shockwaves, glitch portals, neon tunnel cuts.' },
  { id: 'creator' as const, name: 'Creator Magic', detail: 'Vertical short, clean captions, glow, glass and liquid moves.' },
  { id: 'podcast' as const, name: 'Podcast Magic', detail: 'Clean dialogue flow, chapter cards, voice polish, and readable captions.' },
  { id: 'travel' as const, name: 'Travel Magic', detail: 'Warm montage pacing, postcard cards, scenic dissolves, and route markers.' },
  { id: 'luxury' as const, name: 'Luxury Magic', detail: 'Editorial pacing, reflective transitions, product labels, and premium shine.' }
];

const videoTemplateItems = [
  { id: 'shorts' as const, name: 'Short Viral', detail: '9:16 hook, pop captions, flash cuts, social export feel.' },
  { id: 'gaming' as const, name: 'Gaming Highlight', detail: 'Neon HUD title, glitch transitions, beat markers.' },
  { id: 'product' as const, name: 'Product Ad', detail: 'Luxury label, clean grade, premium product callouts.' },
  { id: 'trailer' as const, name: 'Cinematic Trailer', detail: '21:9 tone, film titles, burn and anamorphic transitions.' },
  { id: 'podcast' as const, name: 'Podcast Clip', detail: 'Voice polish, chapter titles, subtitle stack, and clean framing.' },
  { id: 'travel' as const, name: 'Travel Vlog', detail: 'Warm grade, postcard overlays, and scenic montage pacing.' },
  { id: 'fashion' as const, name: 'Fashion Reel', detail: 'Luxury captions, runway flow, and glass drift transitions.' },
  { id: 'reaction' as const, name: 'Reaction Edit', detail: 'Comment bubbles, meme captions, and quick punch zooms.' },
  { id: 'music' as const, name: 'Music Montage', detail: 'Beat markers, flash frames, and title slams built for rhythm.' },
  { id: 'tutorial' as const, name: 'Tutorial Breakdown', detail: 'Step cards, clean callouts, and readable pacing for explainers.' },
  { id: 'real-estate' as const, name: 'Real Estate Tour', detail: 'Luxury room labels, smooth walkthrough motion, and elegant grade.' },
  { id: 'launch' as const, name: 'Launch Teaser', detail: 'Product hero reveal, countdown text, and premium opener energy.' }
];

const completeTemplatePacks = [
  { name: 'Podcast Clip', detail: 'Voice clean, captions, safe crop and title stack.', feature: 'voice-tools' },
  { name: 'Thumbnail + Short', detail: 'Hook title, thumbnail marker, captions and export setup.', feature: 'thumbnail-studio' },
  { name: 'Brand Launch', detail: 'Brand kit, product shine, lower thirds and clean export.', feature: 'brand-kit' },
  { name: 'Travel Vlog', detail: 'Warm grade, smooth glass transitions and montage markers.', feature: 'magic-edit' },
  { name: 'Luxury Reel', detail: 'Premium glow, product labels, cinematic grade and watermark pass.', feature: 'style-packs' },
  { name: 'Client Preview', detail: 'Review watermark, notes marker, safe zones and export checklist.', feature: 'client-review' },
  { name: 'Gaming Montage', detail: 'Beat sync, rank-up titles, shockwave cuts, and neon HUD overlays.', feature: 'beat-sync' },
  { name: 'Creator Daily Pack', detail: 'Hook opener, clean captions, warm grade, and social CTA stack.', feature: 'auto-captions-style' },
  { name: 'Reaction Breakdown', detail: 'Comment bubbles, subtitle pops, and fast meme timing.', feature: 'hook-generator' },
  { name: 'Product Launch Max', detail: 'Luxury labels, shine FX, launch countdown, and auto reframe.', feature: 'auto-reframe' },
  { name: 'Travel Story Max', detail: 'Map cards, scenic dissolves, chapter titles, and montage music.', feature: 'smart-timeline' },
  { name: 'Podcast Studio', detail: 'Voice cleanup, chapter markers, and safe captions for long-form cuts.', feature: 'project-assistant' }
];

const studioFeatureCards = [
  { id: 'magic-edit', name: '1. Magic Edit', detail: 'Builds a montage with cuts, generated music, captions, effects, transitions and format.' },
  { id: 'project-assistant', name: '2. Project Assistant', detail: 'Adds a local review pass for intro, text, audio, hook and dark-shot risks.' },
  { id: 'auto-captions-style', name: '3. Stylish Auto Captions', detail: 'Creates TikTok-style pop captions with glow, punch and correction-ready layout.' },
  { id: 'beat-sync', name: '4. Beat Sync', detail: 'Adds beat markers, impact effects, zooms, flashes, shake and transitions.' },
  { id: 'smart-timeline', name: '5. Smart Timeline', detail: 'Adds cut suggestions, moment markers and transition recommendations.' },
  { id: 'style-packs', name: '6. Style Packs', detail: 'Applies Creator, Gaming, Luxury and Cinematic style stacks.' },
  { id: 'video-templates', name: '7. Video Templates', detail: 'Applies a full Short Viral template with title, captions, effects and transitions.' },
  { id: 'brand-kit', name: '8. Brand Kit', detail: 'Adds watermark, color identity, caption style and brand-safe polish.' },
  { id: 'multi-camera', name: '9. Multi-Camera', detail: 'Creates angle markers and sync points for simple multicam editing.' },
  { id: 'motion-tracking', name: '10. Motion Tracking', detail: 'Adds tracked callout placeholders and follow-anchor effects.' },
  { id: 'privacy', name: '11. Face Blur / Privacy', detail: 'Adds privacy blur, face blur and personal-info cleanup effects.' },
  { id: 'b-roll-finder', name: '12. AI B-Roll Finder', detail: 'Marks slow moments and adds B-roll-needed overlays.' },
  { id: 'hook-generator', name: '13. Hook Generator', detail: 'Creates five strong intro hooks and punch effects.' },
  { id: 'thumbnail-studio', name: '14. Thumbnail Studio', detail: 'Marks a thumbnail frame with subject glow and background blur.' },
  { id: 'sound-designer', name: '15. Sound Designer', detail: 'Generates whoosh, impact and logo chime sounds onto audio tracks.' },
  { id: 'voice-tools', name: '16. Voice Tools', detail: 'Adds denoise, normalize, silence removal, pitch and studio voice effects.' },
  { id: 'auto-reframe', name: '17. Auto Reframe', detail: 'Switches to 9:16 and adds subject center lock with background blur.' },
  { id: 'versioning', name: '18. Versioning', detail: 'Creates a local backup snapshot and version marker.' },
  { id: 'client-review', name: '19. Client Review', detail: 'Adds preview watermark, review marker and notes workflow.' },
  { id: 'marketplace-premium', name: '20. Marketplace Premium', detail: 'Prepares premium pack organization for effects, LUTs, sounds and stickers.' },
  { id: 'daily-free-unlock', name: '21. Daily Unlock', detail: 'Activates a daily free trial-style premium item locally.' },
  { id: 'challenges', name: '22. Creator Challenges', detail: 'Adds a challenge title, markers and energetic transitions.' },
  { id: 'workspace-layouts', name: '23. Workspace Layouts', detail: 'Adds a workspace marker and maps workflows to panels.' },
  { id: 'color-studio', name: '24. Color Studio', detail: 'Adds scopes, skin tone protect, color match and cinematic grade.' },
  { id: 'export-intelligent', name: '25. Smart Export', detail: 'Adds export recommendation markers and notes.' },
  { id: 'preview-cache', name: '26. Preview Cache', detail: 'Marks heavy effects for render preview caching.' },
  { id: 'plugin-system', name: '27. Plugin System', detail: 'Creates a local plugin registry preview for future packs.' },
  { id: 'edify-score', name: '28. Edify Score', detail: 'Adds a project score card based on rhythm, captions, audio and hook readiness.' },
  { id: 'style-transfer', name: '29. Style Transfer', detail: 'Copies selected clip style to matching clips, or prepares a style pass.' },
  { id: 'smart-media', name: '30. Smart Media Library', detail: 'Categorizes assets into video, vertical, audio, images and generated media.' }
];

const marketplacePacks = [
  { name: 'Creator Essentials', price: 'Free', detail: 'Free effects, texts, transitions, and sound starters.', premium: false },
  { name: 'Premium Locked Preview', price: 'Free Preview', detail: 'Try locked Premium effects in the editor before buying.', premium: false },
  { name: 'Creator Glow Pack', price: '4,99 €', detail: 'Skin light, soft bloom, clean creator looks.', premium: true },
  { name: 'Gaming Motion Pack', price: '6,99 €', detail: 'Glitches, speed lines, hit flashes, zoom warps.', premium: true },
  { name: 'Cinematic Starter', price: 'Free', detail: 'Cool tones, bars, film grain, montage templates.', premium: false },
  { name: 'Subtitle Pro Kit', price: '3,99 €', detail: 'Kinetic captions, outline styles, viral presets.', premium: true },
  { name: 'VIP Sound Library', price: '4,99 €', detail: 'Trailer booms, luxury logos, creator sweeps, and risers.', premium: true },
  { name: 'Color Filter Vault', price: '5,99 €', detail: 'Premium LUT-style filters for creator, cinema, and gaming edits.', premium: true },
  { name: 'VIP Transition Vault', price: '5,99 €', detail: 'Liquid zooms, glass wipes, film burns, and speed tunnels.', premium: true },
  { name: 'AI Creator Boost', price: '7,99 €', detail: 'Montage helpers, hook presets, color match, and caption styling.', premium: true },
  { name: 'Cinematic VIP Looks', price: '8,99 €', detail: 'Film halation, pro mist, teal grade, and trailer impact styles.', premium: true },
  { name: 'VIP Text Studio', price: '4,99 €', detail: 'Premium titles, captions, lower thirds, HUD labels, and text animations.', premium: true },
  { name: 'Creator Title Vault', price: '5,99 €', detail: 'Luxury lower thirds, diamond captions, product callouts, and shorts text.', premium: true }
];

const marketplaceBundles = [
  { name: 'Shorts Creator Stack', detail: 'Captions, sounds, hook titles, and creator transitions.', action: 'style-packs' },
  { name: 'Gaming Motion Stack', detail: 'Shockwaves, speed lines, rank-up captions, and beat sync tools.', action: 'beat-sync' },
  { name: 'Cinematic Review Stack', detail: 'Trailer looks, client preview, LUTs, and review watermark flow.', action: 'client-review' }
];

const pluginModules = [
  { name: 'Template Loader', detail: 'Drop new full edit systems into Edify.', feature: 'plugin-system' },
  { name: 'FX Extension Pack', detail: 'Install additional looks, transitions, and motion chains.', feature: 'plugin-system' },
  { name: 'AI Tool Slot', detail: 'Prepare future helpers like transcription, reframing, and cleanup.', feature: 'plugin-system' },
  { name: 'Export Module', detail: 'Future delivery plugins for new codecs and client review paths.', feature: 'plugin-system' }
];

const captionStyleCards = [
  { name: 'TikTok Pop', detail: 'Word punch, karaoke glow, and bold short-form timing.' },
  { name: 'Creator Clean', detail: 'Clear subtitle stack for tutorials, voiceovers, and reels.' },
  { name: 'Gaming Rank-Up', detail: 'Neon HUD, impact words, and punch counters.' },
  { name: 'Cinematic Burn-In', detail: 'Letterbox-safe captions for trailer and review exports.' }
];

const audioStudioCards = [
  { name: 'Normalize Mix', detail: 'Even out volume and prep a cleaner export.', feature: 'voice-tools' },
  { name: 'Voice Enhance', detail: 'Denoise, studio voice, and dialogue polish.', feature: 'voice-tools' },
  { name: 'Remove Silence', detail: 'Cut dead air and tighten commentary clips.', feature: 'voice-tools' },
  { name: 'Beat Markers', detail: 'Add music beat markers and montage timing points.', feature: 'beat-sync' }
];

const colorScopeCards = [
  { name: 'Waveform', detail: 'Read luma balance before export.', effect: 'Waveform Scope' },
  { name: 'RGB Parade', detail: 'Check channel separation and clipping.', effect: 'RGB Parade' },
  { name: 'Vectorscope', detail: 'Keep saturation and skin tones under control.', effect: 'Vectorscope' },
  { name: 'Before / After', detail: 'Compare grading passes on the selected clip.', effect: 'Before After Compare' }
];

const suiteLaunchModules = [
  { id: 'magic' as const, name: 'Magic Edit 3.0', detail: 'Build a first cut with music, captions, cuts, transitions, zooms, hooks, and social format.', badge: 'Auto edit' },
  { id: 'captions' as const, name: 'AI Caption Studio', detail: 'Create stylish word-punch captions with glow, hook timing, and censure-ready layout.', badge: 'Captions' },
  { id: 'thumbnail' as const, name: 'Thumbnail Studio Pro 2', detail: 'Open the cover workflow with glow, outline, viral text, packs, and PNG export.', badge: 'PNG' },
  { id: 'audio' as const, name: 'Audio Studio Pro', detail: 'Add beat detection, voice enhance, silence remove, ducking, and premium sound cues.', badge: 'Sound' },
  { id: 'marketplace' as const, name: 'Marketplace Premium', detail: 'Browse owned packs, locked packs, rewards, promo codes, VIP state, and unlock history.', badge: 'Store' },
  { id: 'cloud' as const, name: 'Cloud Projects', detail: 'Connect account sync for projects, packs, rewards, preferences, presets, and layouts.', badge: 'Account' },
  { id: 'review' as const, name: 'Client Review Mode', detail: 'Add review watermark, timecode notes, safe zones, approval states, and preview workflow.', badge: 'Review' },
  { id: 'color' as const, name: 'Color Studio', detail: 'Apply cinematic LUTs, curves, before/after, scopes, skin tone protect, and exposure pass.', badge: 'Grade' },
  { id: 'keyframes' as const, name: 'Keyframe Motion Studio', detail: 'Add visible motion keyframes, easing, zoom, opacity, and pop animation presets.', badge: 'Motion' },
  { id: 'templates' as const, name: 'Template Engine', detail: 'Apply full templates with timeline, captions, sounds, transitions, hooks, and export format.', badge: 'Templates' }
];

type FavoritePreset = {
  kind: 'effect' | 'filter' | 'transition' | 'text' | 'sticker' | 'premium' | 'premium-transition' | 'premium-text' | 'premium-text-animation' | 'premium-filter' | 'premium-caption';
  name: string;
};

function favoriteKey(kind: FavoritePreset['kind'], name: string) {
  return `${kind}:${name}`;
}

function loadFavoriteKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem('edify-favorite-presets') ?? '[]') as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatRewardTime(ms: number) {
  if (ms <= 0) return 'Expired';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`;
}

export function LeftSidebar({
  activePanel,
  onPanelChange,
  project,
  selectedClip,
  accountUser,
  onOpenAccount,
  onImportMedia,
  onAddText,
  onAddEffect,
  onAddTransition,
  onAddClip,
  onUpdateClip,
  onDeleteAsset,
  onExport,
  onRecordVoice,
  isRecordingVoice,
  onMagicEdit,
  onBeatSync,
  onApplyVideoTemplate,
  onStudioFeature,
  pushToast
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [showPremiumOffer, setShowPremiumOffer] = useState(false);
  const [showSponsoredUnlock, setShowSponsoredUnlock] = useState(false);
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccess>(() => loadPremiumAccess());
  const [rewardNow, setRewardNow] = useState(Date.now());
  const [assetMenu, setAssetMenu] = useState<{ x: number; y: number; asset: MediaAsset } | null>(null);
  const [isCaptioning, setIsCaptioning] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => loadFavoriteKeys());
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const filteredAssets = useMemo(() => {
    return project.assets.filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()));
  }, [project.assets, query]);
  const premiumQueryItems = useMemo(() => {
    return premiumEffectPresets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.pack.toLowerCase().includes(query.toLowerCase()));
  }, [query]);
  const premiumTransitionQueryItems = useMemo(() => {
    return premiumTransitionPresets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.pack.toLowerCase().includes(query.toLowerCase()));
  }, [query]);
  const premiumTextQueryItems = useMemo(() => {
    return premiumTextPresets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.pack.toLowerCase().includes(query.toLowerCase()));
  }, [query]);
  const premiumTextAnimationQueryItems = useMemo(() => {
    return premiumTextAnimationPresets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.pack.toLowerCase().includes(query.toLowerCase()));
  }, [query]);
  const premiumFilterQueryItems = useMemo(() => {
    return premiumFilterPresets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.pack.toLowerCase().includes(query.toLowerCase()));
  }, [query]);
  const premiumCaptionQueryItems = useMemo(() => {
    return premiumCaptionPresets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.pack.toLowerCase().includes(query.toLowerCase()));
  }, [query]);
  const filteredPremiumSounds = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return premiumSoundItems;
    return premiumSoundItems.filter((sound) => `${sound.name} ${sound.tag}`.toLowerCase().includes(normalized));
  }, [query]);
  const filteredSounds = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return soundItems;
    return soundItems.filter((sound) => `${sound.name} ${sound.tag}`.toLowerCase().includes(normalized));
  }, [query]);
  const filteredStickerItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return stickerItems;
    return stickerItems.filter((sticker) => sticker.toLowerCase().includes(normalized));
  }, [query]);
  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);
  const moderationReport = useMemo(() => scanProject(project), [project]);
  const sponsoredRewardItems = useMemo(() => rewardItemNames(premiumAccess), [premiumAccess]);
  const sponsoredRewardRemaining = rewardTimeRemaining(premiumAccess, rewardNow);
  const hasSponsoredReward = activeRewardUnlocks(premiumAccess, rewardNow).length > 0;
  const pendingSponsoredClaim = useMemo(() => getPendingSponsoredClaim(premiumAccess, rewardNow), [premiumAccess, rewardNow]);
  const sponsorSeriesProgress = useMemo(() => getSponsorSeriesProgress(premiumAccess), [premiumAccess]);
  const rewardHistory = useMemo(() => getRewardHistory(premiumAccess).slice(0, 3), [premiumAccess]);
  const canStartDailySponsored = useMemo(() => canStartSponsoredUnlockToday(premiumAccess, rewardNow), [premiumAccess, rewardNow]);
  const sponsoredCandidates = useMemo(() => [
    ...premiumCaptionPresets,
    ...premiumFilterPresets,
    ...premiumTextPresets,
    ...premiumTextAnimationPresets,
    ...premiumEffectPresets,
    ...premiumTransitionPresets
  ], []);
  const assistantInsights = useMemo(() => {
    const clips = project.tracks.flatMap((track) => track.clips);
    const visualClips = clips.filter((clip) => clip.kind === 'video' || clip.kind === 'image');
    const textClips = clips.filter((clip) => clip.kind === 'text');
    const audioClips = clips.filter((clip) => clip.kind === 'audio');
    const insights: Array<{ title: string; detail: string; tone: 'good' | 'warn' | 'danger' }> = [];
    if (visualClips.length === 0) insights.push({ title: 'No visual sequence', detail: 'Import clips or use Magic Edit to build a first cut.', tone: 'danger' });
    if (visualClips.length > 0 && visualClips[0].duration > 5) insights.push({ title: 'Intro could be faster', detail: 'First clip is long. Beat Sync can add punchy cuts and markers.', tone: 'warn' });
    if (textClips.length === 0) insights.push({ title: 'No captions yet', detail: 'Stylish auto captions will improve short-form readability.', tone: 'warn' });
    if (audioClips.length === 0) insights.push({ title: 'No music bed', detail: 'Magic Edit can add a generated loop and beat markers.', tone: 'warn' });
    if (project.settings.aspectRatio === '16:9' && project.duration < 45) insights.push({ title: 'Short-form opportunity', detail: 'Try the Short Viral template for Reels, Shorts, and TikTok.', tone: 'good' });
    return insights.slice(0, 5);
  }, [project]);
  const sponsoredStatusLabel = premiumAccess.all
    ? 'Studio Max active'
    : premiumAccess.packs.length > 0
      ? `${premiumAccess.packs.length} pack active`
      : pendingSponsoredClaim
        ? 'Reward choice waiting'
        : sponsorSeriesProgress
          ? `Sponsor series in progress - Ad ${sponsorSeriesProgress.variantIndex + 1}`
          : hasSponsoredReward
            ? `Sponsored trial ${formatRewardTime(sponsoredRewardRemaining)}`
            : 'Free plan active';
  const sponsoredStrongLabel = pendingSponsoredClaim
    ? 'Reward choice ready'
    : sponsorSeriesProgress
      ? 'Resume sponsor series'
      : hasSponsoredReward
        ? `${sponsoredRewardItems.length} premium items unlocked`
        : canStartDailySponsored
          ? 'Watch Edify sponsor series'
          : 'Daily sponsored unlock used';
  const sponsoredSmallLabel = pendingSponsoredClaim
    ? 'Your 3 sponsored ads are done. Choose Creator, Gaming, or Cinematic now, or keep the reward safely locked for later.'
    : sponsorSeriesProgress
      ? `Resume at Ad ${sponsorSeriesProgress.variantIndex + 1} with about ${sponsorSeriesProgress.secondsLeft}s left in this series.`
      : hasSponsoredReward
        ? `Expires in ${formatRewardTime(sponsoredRewardRemaining)}. Premium plans still unlock everything permanently.`
        : canStartDailySponsored
          ? 'Watch 3 ads (30s + 20s + 15s) to unlock 5 random base premium items for 24 hours.'
          : 'Come back tomorrow for another sponsored reward series.';
  const sponsoredButtonLabel = pendingSponsoredClaim
    ? 'Claim reward'
    : sponsorSeriesProgress
      ? 'Resume series'
      : hasSponsoredReward
        ? 'Refresh trial'
        : canStartDailySponsored
          ? 'Start sponsor series'
          : 'Available tomorrow';

  useEffect(() => {
    const timer = window.setInterval(() => setRewardNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const favoritePresets = useMemo<FavoritePreset[]>(() => {
    const all: FavoritePreset[] = [
      ...effectPresets.map((name) => ({ kind: 'effect' as const, name })),
      ...filterPresets.map((name) => ({ kind: 'filter' as const, name })),
      ...transitionPresets.map((name) => ({ kind: 'transition' as const, name })),
      ...textPresets.map((name) => ({ kind: 'text' as const, name })),
      ...textAnimationPresets.map((name) => ({ kind: 'effect' as const, name })),
      ...premiumEffectPresets.map((item) => ({ kind: 'premium' as const, name: item.name })),
      ...premiumTransitionPresets.map((item) => ({ kind: 'premium-transition' as const, name: item.name })),
      ...premiumTextPresets.map((item) => ({ kind: 'premium-text' as const, name: item.name })),
      ...premiumTextAnimationPresets.map((item) => ({ kind: 'premium-text-animation' as const, name: item.name })),
      ...premiumFilterPresets.map((item) => ({ kind: 'premium-filter' as const, name: item.name })),
      ...premiumCaptionPresets.map((item) => ({ kind: 'premium-caption' as const, name: item.name }))
    ];
    return all.filter((item) => favoriteSet.has(favoriteKey(item.kind, item.name)));
  }, [favoriteSet]);

  const toggleFavorite = (kind: FavoritePreset['kind'], name: string) => {
    const key = favoriteKey(kind, name);
    setFavoriteKeys((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      localStorage.setItem('edify-favorite-presets', JSON.stringify(next));
      return next;
    });
  };

  const openAssetMenu = (event: React.MouseEvent, asset: MediaAsset) => {
    event.preventDefault();
    event.stopPropagation();
    setAssetMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 126),
      asset
    });
  };

  const toggleAutoCaptions = () => {
    if (isCaptioning) {
      recognitionRef.current?.stop();
      setIsCaptioning(false);
      return;
    }

    const SpeechRecognition = (window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    } }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      generateSmartCaptions();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim();
        if (result.isFinal && transcript) {
          onAddText('Subtitle', undefined, undefined, transcript);
        }
      }
    };
    recognition.onend = () => setIsCaptioning(false);
    recognition.onerror = () => setIsCaptioning(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsCaptioning(true);
  };

  const generateSmartCaptions = () => {
    const timelineClips = project.tracks.flatMap((track) => track.clips);
    const sourceClip =
      selectedClip ??
      timelineClips.find((clip) => clip.kind === 'video' || clip.kind === 'audio') ??
      timelineClips.find((clip) => clip.kind === 'text');
    const sourceText =
      captionDraft.trim() ||
      selectedClip?.text?.trim() ||
      sourceClip?.name.replace(/[-_]/g, ' ') ||
      'Edify automatic caption';
    const words = sourceText.split(/\s+/).filter(Boolean);
    const chunks = chunkWords(words.length > 3 ? words : [...words, 'creative', 'edit', 'ready'], 5);
    const start = sourceClip?.start ?? 0;
    const totalDuration = Math.max(2.4, Math.min(sourceClip?.duration ?? chunks.length * 2.2, chunks.length * 3));
    const chunkDuration = Math.max(1.2, totalDuration / chunks.length);

    chunks.forEach((text, index) => {
      onAddText('Subtitle', start + index * chunkDuration, undefined, text, chunkDuration);
    });
  };

  const generateStylishCaptions = () => {
    const timelineClips = project.tracks.flatMap((track) => track.clips);
    const sourceClip =
      selectedClip ??
      timelineClips.find((clip) => clip.kind === 'video' || clip.kind === 'audio') ??
      timelineClips.find((clip) => clip.kind === 'text');
    const sourceText =
      captionDraft.trim() ||
      selectedClip?.text?.trim() ||
      sourceClip?.name.replace(/[-_]/g, ' ') ||
      'Edify stylish automatic captions';
    const words = sourceText.split(/\s+/).filter(Boolean);
    const chunks = chunkWords(words.length > 4 ? words : [...words, 'watch', 'this', 'moment', 'again'], 4);
    const presets = ['Creator Pop Subtitle', 'Diamond Caption', 'Gaming Callout Captions', 'Auto Viral Captions Pro'];
    const start = sourceClip?.start ?? 0;
    const chunkDuration = Math.max(1.05, Math.min(2.1, (sourceClip?.duration ?? chunks.length * 1.55) / Math.max(1, chunks.length)));
    chunks.forEach((text, index) => {
      onAddText(presets[index % presets.length], start + index * chunkDuration, undefined, text.toUpperCase(), chunkDuration);
    });
    ['Karaoke Glow', 'Word Punch', 'Caption Bounce Pro'].forEach((effect) => onAddEffect(effect));
    pushToast({ title: 'Stylish captions created', detail: 'Pop captions with glow and punch animations were added.', tone: 'success' });
  };

  const canUsePremium = (item: PremiumEffectPreset) => {
    return premiumAccess.all || premiumAccess.packs.includes(item.pack) || hasRewardItem(premiumAccess, item.name);
  };

  const handleLockedPremium = (item: PremiumEffectPreset) => {
    onAddEffect(item.name);
    pushToast({ title: 'Premium preview added', detail: `${item.name} previews now. Final premium use unlocks from the Store.`, tone: 'info' });
  };

  const handleLockedPremiumTransition = (item: PremiumEffectPreset) => {
    onAddTransition(item.name);
    pushToast({ title: 'VIP transition preview added', detail: `${item.name} was added as a premium transition preview.`, tone: 'info' });
  };

  const handleLockedPremiumText = (item: PremiumEffectPreset) => {
    onAddText(item.name);
    pushToast({ title: 'VIP text preview added', detail: `${item.name} was placed on the text track.`, tone: 'info' });
  };

  const handleLockedPremiumTextAnimation = (item: PremiumEffectPreset) => {
    onAddEffect(item.name);
    pushToast({ title: 'VIP text animation preview added', detail: `${item.name} was added to the selected text/effect stack.`, tone: 'info' });
  };

  const handleLockedPremiumFilter = (item: PremiumEffectPreset) => {
    onAddEffect(item.name);
    pushToast({ title: 'VIP filter preview added', detail: `${item.name} was added as a premium filter preview.`, tone: 'info' });
  };

  const handleLockedPremiumCaption = (item: PremiumEffectPreset) => {
    onAddText(item.name, undefined, undefined, item.name.replace(/ Pro| Captions| Caption/g, ''), 3.6);
    pushToast({ title: 'VIP caption preview added', detail: `${item.name} was placed on the text track.`, tone: 'info' });
  };

  const runQuickMode = (mode: typeof quickModes[number]) => {
    mode.effects.forEach((effect) => onAddEffect(effect));
    onAddText(mode.text);
    pushToast({
      title: `${mode.name} applied`,
      detail: selectedClip ? 'Effects were added to the selected clip.' : 'A text layer was added. Select a clip to apply the effects too.',
      tone: 'success'
    });
  };

  const runMagicEdit = (style: typeof magicEditStyles[number]['id']) => {
    onMagicEdit(style);
    pushToast({ title: 'Magic Edit built', detail: `${style} montage, transitions, captions, music, markers, and format were applied.`, tone: 'success' });
  };

  const runBeatSync = () => {
    onBeatSync();
    pushToast({ title: 'Beat Sync applied', detail: 'Beat markers, impact effects, and energetic transitions were added.', tone: 'success' });
  };

  const runVideoTemplate = (template: typeof videoTemplateItems[number]['id']) => {
    onApplyVideoTemplate(template);
    pushToast({ title: 'Template applied', detail: 'Format, titles, captions, effects, and transitions were added.', tone: 'success' });
  };

  const runStudioFeature = (feature: typeof studioFeatureCards[number]) => {
    onStudioFeature(feature.id);
    if (feature.id === 'marketplace-premium') onPanelChange('premium');
    if (feature.id === 'color-studio') onPanelChange('color');
    if (feature.id === 'smart-media') onPanelChange('assets');
    if (feature.id === 'video-templates') onPanelChange('templates');
    pushToast({ title: feature.name.replace(/^\d+\.\s*/, ''), detail: 'Feature applied to the current project.', tone: 'success' });
  };

  const runStudioFeatureById = (featureId: string) => {
    const feature = studioFeatureCards.find((item) => item.id === featureId);
    if (feature) {
      runStudioFeature(feature);
      return;
    }
    onStudioFeature(featureId);
    pushToast({ title: 'Studio system applied', detail: featureId, tone: 'success' });
  };

  const runSuiteModule = (moduleId: typeof suiteLaunchModules[number]['id']) => {
    if (moduleId === 'magic') {
      runMagicEdit('creator');
      runBeatSync();
      onPanelChange('quick');
      return;
    }
    if (moduleId === 'captions') {
      generateStylishCaptions();
      applyReviewTool('caption-clean');
      onPanelChange('captions');
      return;
    }
    if (moduleId === 'thumbnail') {
      onStudioFeature('thumbnail-studio');
      pushToast({ title: 'Thumbnail Studio Pro 2', detail: 'Thumbnail workflow opened with cover, glow, outline, and PNG export tools.', tone: 'success' });
      return;
    }
    if (moduleId === 'audio') {
      ['Voice Enhance Pro', 'Remove Silence Pro', 'Auto Duck Music', 'Beat Detect Pro'].forEach((effect) => onAddEffect(effect));
      const soundAsset = createGeneratedSoundAsset({ name: 'Audio Studio Pro Bed', duration: 10, tag: 'Music' });
      onAddClip(soundAsset);
      onPanelChange('sounds');
      pushToast({ title: 'Audio Studio Pro applied', detail: 'Voice chain, ducking, beat detection, and a music bed were added.', tone: 'success' });
      return;
    }
    if (moduleId === 'marketplace') {
      onPanelChange('marketplace');
      pushToast({ title: 'Marketplace Premium', detail: 'Store opened with premium packs, rewards, bundles, and unlock history.', tone: 'info' });
      return;
    }
    if (moduleId === 'cloud') {
      onOpenAccount();
      pushToast({ title: 'Cloud Projects', detail: 'Connect an account to attach projects, packs, rewards, presets, and layouts.', tone: 'info' });
      return;
    }
    if (moduleId === 'review') {
      onStudioFeature('client-review');
      applyReviewTool('export-compliance');
      onPanelChange('moderation');
      return;
    }
    if (moduleId === 'color') {
      ['Cinematic Color Studio', 'Curves Control', 'RGB Parade', 'Before After Compare'].forEach((effect) => applyColorEffect(effect));
      onPanelChange('color');
      return;
    }
    if (moduleId === 'keyframes') {
      if (!selectedClip) {
        pushToast({ title: 'Select a clip first', detail: 'Pick a video, image, or text clip, then run Keyframe Motion Studio.', tone: 'info' });
        return;
      }
      onUpdateClip(selectedClip.id, (clip) => ({
        ...clip,
        effects: [
          ...clip.effects,
          { id: `fx-${Date.now()}-easing`, name: 'Motion Easing: Smooth', kind: 'motion-easing', enabled: true, intensity: 80 },
          { id: `fx-${Date.now()}-preview`, name: 'Visible Keyframe Track', kind: 'visible-keyframe-track', enabled: true, intensity: 70 }
        ],
        keyframes: [
          ...clip.keyframes.filter((frame) => !['scale', 'opacity', 'x'].includes(frame.property)),
          { id: `keyframe-${Date.now()}-a`, time: clip.start, property: 'scale', value: Math.max(0.72, clip.transform.scale * 0.82) },
          { id: `keyframe-${Date.now()}-b`, time: clip.start, property: 'opacity', value: 0.15 },
          { id: `keyframe-${Date.now()}-c`, time: clip.start + Math.min(0.45, clip.duration * 0.25), property: 'scale', value: clip.transform.scale * 1.08 },
          { id: `keyframe-${Date.now()}-d`, time: clip.start + Math.min(0.8, clip.duration * 0.38), property: 'scale', value: clip.transform.scale },
          { id: `keyframe-${Date.now()}-e`, time: clip.start + Math.min(0.8, clip.duration * 0.38), property: 'opacity', value: clip.transform.opacity },
          { id: `keyframe-${Date.now()}-f`, time: clip.start + Math.min(0.8, clip.duration * 0.38), property: 'x', value: clip.transform.x }
        ]
      }));
      pushToast({ title: 'Keyframe Motion Studio', detail: 'Pop-in scale, opacity, easing, and visible keyframe track were added to the selected clip.', tone: 'success' });
      return;
    }
    runVideoTemplate('shorts');
    onPanelChange('templates');
  };

  const runVoicePreset = (name: string, effects: string[]) => {
    effects.forEach((effect) => onAddEffect(effect));
    pushToast({ title: name, detail: `${effects.length} voice tool${effects.length > 1 ? 's' : ''} applied to the selected audio/video.`, tone: 'success' });
  };

  const applyColorEffect = (name: string, kind = name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), intensity = 76) => {
    if (!selectedClip) {
      onAddEffect(name);
      pushToast({ title: 'Color effect ready', detail: `${name} was applied to the active visible clip.`, tone: 'success' });
      return;
    }
    onUpdateClip(selectedClip.id, (clip) => {
      const existing = clip.effects.find((effect) => effect.kind === kind || effect.name === name);
      if (existing) {
        return {
          ...clip,
          effects: clip.effects.map((effect) =>
            effect.id === existing.id ? { ...effect, name, kind, enabled: true, intensity } : effect
          )
        };
      }
      return {
        ...clip,
        effects: [
          ...clip.effects,
          {
            id: `fx-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name,
            kind,
            enabled: true,
            intensity
          }
        ]
      };
    });
  };

  const setClipLabelColor = (color: string) => {
    if (!selectedClip) {
      pushToast({ title: 'Select a clip first', detail: 'Pick a timeline clip, then choose a label color.', tone: 'info' });
      return;
    }
    onUpdateClip(selectedClip.id, (clip) => ({ ...clip, color }));
  };

  const applyReviewFixAll = () => {
    const clips = allProjectClips(project);
    if (clips.length === 0) {
      onMagicEdit('creator');
      pushToast({ title: 'Project repaired', detail: 'Magic Edit created a starter timeline because there were no clips to fix.', tone: 'success' });
      return;
    }
    clips.forEach(({ clip }) => {
      onUpdateClip(clip.id, (current) => ({
        ...current,
        text: current.kind === 'text' ? cleanSensitiveText(current.text ?? current.name) : current.text,
        transform: current.kind === 'text'
          ? {
              ...current.transform,
              x: Math.max(-420, Math.min(420, current.transform.x)),
              y: Math.max(-280, Math.min(280, current.transform.y)),
              scale: Math.max(0.72, current.transform.scale),
              opacity: Math.max(0.92, current.transform.opacity)
            }
          : current.transform,
        audio: {
          ...current.audio,
          volume: Math.min(0.92, current.audio.volume),
          denoise: Math.max(35, current.audio.denoise),
          fadeIn: Math.max(current.audio.fadeIn, current.kind === 'audio' ? 0.12 : current.audio.fadeIn),
          fadeOut: Math.max(current.audio.fadeOut, current.kind === 'audio' ? 0.18 : current.audio.fadeOut)
        },
        effects: current.effects.some((effect) => effect.kind === 'brand-safe')
          ? current.effects
          : [
              ...current.effects,
              { id: `fx-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: 'Brand Safe Pass', kind: 'brand-safe', enabled: true, intensity: 80 },
              { id: `fx-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: current.kind === 'text' ? 'Safe Text Readability' : 'Safe Zone Guides', kind: current.kind === 'text' ? 'text-box' : 'safe-zone-guides', enabled: true, intensity: 62 }
            ]
      }));
    });
    pushToast({ title: 'Review fixes applied', detail: 'Text, audio, privacy, and safe-zone fixes were applied.', tone: 'success' });
  };

  const applyReviewTool = (tool: string) => {
    if (tool === 'caption-clean') {
      allProjectClips(project).filter(({ clip }) => clip.kind === 'text').forEach(({ clip }) => {
        onUpdateClip(clip.id, (current) => ({ ...current, text: cleanSensitiveText(current.text ?? current.name) }));
      });
      pushToast({ title: 'Caption Clean Pro', detail: 'Sensitive words and personal info were censored in text layers.', tone: 'success' });
      return;
    }
    if (tool === 'loudness') {
      allProjectClips(project).filter(({ clip }) => clip.kind === 'audio' || clip.kind === 'video').forEach(({ clip }) => {
        onUpdateClip(clip.id, (current) => ({ ...current, audio: { ...current.audio, volume: Math.min(0.9, current.audio.volume), denoise: Math.max(42, current.audio.denoise), fadeIn: Math.max(current.audio.fadeIn, 0.08), fadeOut: Math.max(current.audio.fadeOut, 0.16) } }));
      });
      pushToast({ title: 'Audio Loudness Pro', detail: 'Audio was normalized with denoise and short fades.', tone: 'success' });
      return;
    }
    if (tool === 'privacy') {
      onAddEffect('Privacy Blur');
      onAddEffect('Face Blur');
      pushToast({ title: 'Privacy tools added', detail: 'Face blur and privacy blur were added to the active clip.', tone: 'success' });
      return;
    }
    if (tool === 'export-compliance') {
      onAddEffect('Safe Zone Guides');
      pushToast({ title: 'Export Compliance Pack', detail: 'Safe-zone guides and social export checks were added.', tone: 'success' });
      return;
    }
    if (tool === 'ai-safety') {
      applyReviewFixAll();
      onAddEffect('AI Safety Check Pro');
      pushToast({ title: 'AI Safety Check Pro', detail: 'Full project scan fixes and safety tags were applied.', tone: 'success' });
      return;
    }
    if (tool === 'brand-safe') {
      allProjectClips(project).forEach(({ clip }) => {
        onUpdateClip(clip.id, (current) => ({
          ...current,
          text: current.kind === 'text' ? cleanSensitiveText(current.text ?? current.name) : current.text,
          effects: current.effects.filter((effect) => !/violent|flash|shake|glitch/i.test(effect.name))
        }));
      });
      ['Brand Safe Pass', 'Safe Zone Guides', 'Clean Creator'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'Brand Safe Mode', detail: 'Aggressive text/effects were softened and safe-zone guides were added.', tone: 'success' });
      return;
    }
    if (tool === 'copyright') {
      onAddEffect('Copyright Assistant');
      pushToast({ title: 'Copyright Assistant', detail: 'Audio licence review tags were added before export.', tone: 'info' });
      return;
    }
    if (tool === 'hook') {
      onAddText('Gaming Edit', 0, undefined, 'STOP SCROLLING', 2.4);
      onAddEffect('Zoom Punch');
      onAddEffect('Glow');
      pushToast({ title: 'AI Hook Score improved', detail: 'A stronger opener was added at the start.', tone: 'success' });
      return;
    }
    if (tool === 'thumbnail') {
      onAddEffect('AI Thumbnail Picker');
      pushToast({ title: 'AI Thumbnail Picker', detail: 'Thumbnail candidate effects were prepared on the selected visual.', tone: 'success' });
      return;
    }
    if (tool === 'viral-caption') {
      onAddText('Subtitle', 0, undefined, 'Wait for the reveal', 2.2);
      onAddText('Subtitle', 2.3, undefined, 'This changes everything', 2.4);
      onAddEffect('Caption Pop Pro');
      pushToast({ title: 'AI Viral Caption', detail: 'Two punchier caption hooks were added to the timeline.', tone: 'success' });
      return;
    }
    if (tool === 'bleep') {
      allProjectClips(project).filter(({ clip }) => clip.kind === 'text').forEach(({ clip }) => {
        onUpdateClip(clip.id, (current) => ({ ...current, text: cleanSensitiveText(current.text ?? current.name) }));
      });
      onAddEffect('AI Bleep Cue');
      pushToast({ title: 'AI Bleep / Censure', detail: 'Sensitive captions were masked and a bleep cue was added.', tone: 'success' });
      return;
    }
    if (tool === 'auto-blur') {
      ['Privacy Blur', 'Face Blur', 'Auto Remove Personal Info'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'AI Auto Blur', detail: 'Privacy blur effects were added for faces and personal info.', tone: 'success' });
      return;
    }
    if (tool === 'export-optimizer') {
      onAddEffect('AI Export Optimizer');
      pushToast({ title: 'AI Export Optimizer', detail: 'Export optimizer tag added. Use the export modal to pick the platform quality.', tone: 'success' });
      return;
    }
    if (tool === 'scene-cleanup') {
      ['Clean Creator', 'Shadow Lift', 'Contrast Boost', 'Audio Tight Cut'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'AI Scene Cleanup', detail: 'Color, clarity, and pacing helpers were applied.', tone: 'success' });
      return;
    }
    if (tool === 'safe-mode') {
      allProjectClips(project).forEach(({ clip }) => {
        onUpdateClip(clip.id, (current) => ({
          ...current,
          text: current.kind === 'text' ? cleanSensitiveText(current.text ?? current.name) : current.text,
          effects: current.effects.filter((effect) => !/violent|flash|shake|glitch/i.test(effect.name))
        }));
      });
      pushToast({ title: 'Safe Edit Mode', detail: 'Aggressive words/effects were softened for safer publishing.', tone: 'success' });
    }
  };

  const runAiTool = (tool: typeof aiTools[number]) => {
    if (tool.premium && !hasAnyPremium(premiumAccess)) {
      setShowPremiumOffer(true);
      pushToast({ title: 'Premium AI locked', detail: `${tool.name} is available from Premium. No timeline text was added.`, tone: 'info' });
      return;
    }
    if (tool.action === 'captions') {
      generateSmartCaptions();
      pushToast({ title: 'Auto subtitles created', detail: 'Editable subtitle clips were added to the timeline.', tone: 'success' });
      return;
    }
    if (tool.action === 'beat') {
      runBeatSync();
      return;
    }
    if (tool.action === 'voice') {
      ['Denoise', 'Clean Voice Boost'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'Voice enhancement queued', detail: 'Denoise and clarity controls are now on the selected clip.', tone: 'success' });
      return;
    }
    if (tool.action === 'silence') {
      ['Remove Silence', 'Audio Tight Cut', 'Fade Polish'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'Silence cleanup prepared', detail: 'Smart cut markers and fade polish were added to the selected clip.', tone: 'success' });
      return;
    }
    if (tool.action === 'background') {
      onAddEffect('Background Blur');
      pushToast({ title: 'Background blur added', detail: 'Portrait footage gets a clean landscape fill effect.', tone: 'success' });
      return;
    }
    if (tool.action === 'upscale') {
      setShowPremiumOffer(true);
      pushToast({ title: 'Premium upscale', detail: 'Upscale connects to the premium export workflow.', tone: 'info' });
      return;
    }
    if (tool.action === 'montage') {
      runMagicEdit('creator');
      return;
    }
    if (tool.action === 'hook') {
      ['Zoom Punch', 'Rank Up Flash', 'Glow'].forEach((effect) => onAddEffect(effect));
      onAddText('Gaming Edit');
      pushToast({ title: 'Hook opener added', detail: 'Intro title and punch effects are ready.', tone: 'success' });
      return;
    }
    if (tool.action === 'color-match') {
      ['Clean Creator', 'Contrast Boost', 'Midnight Teal Grade'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'Color match applied', detail: 'The selected clip now has a matched premium grade preview.', tone: 'success' });
      return;
    }
    if (tool.action === 'broll') {
      onAddEffect('Soft Beauty Diffusion');
      pushToast({ title: 'B-roll helper prepared', detail: 'Depth and cover-shot helper effects were prepared without adding text.', tone: 'success' });
      return;
    }
    if (tool.action === 'caption-style') {
      generateStylishCaptions();
      return;
    }
    if (tool.action === 'motion-focus') {
      ['Zoom Punch', 'Motion Blur', 'Cyber HUD Pulse'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'Motion focus added', detail: 'Zoom, blur, and HUD pulse are ready on the selected clip.', tone: 'success' });
      return;
    }
    if (tool.action === 'product') {
      ['Luxury Product Shine', 'Studio Clean HDR', 'Background Blur'].forEach((effect) => onAddEffect(effect));
      pushToast({ title: 'Product shot cleaned', detail: 'Premium shine and clarity effects were added.', tone: 'success' });
      return;
    }
    pushToast({ title: `${tool.name} prepared`, detail: 'This AI workflow is ready in the Edify architecture.', tone: 'info' });
  };

  const addSoundToTimeline = (sound: typeof soundItems[number]) => {
    const asset = createGeneratedSoundAsset(sound);
    onAddClip(asset);
    pushToast({ title: 'Sound placed', detail: `${sound.name} was added to the audio track.`, tone: 'success' });
  };

  const addPremiumSoundToTimeline = (sound: typeof premiumSoundItems[number]) => {
    if (!hasAnyPremium(premiumAccess)) {
      setShowPremiumOffer(true);
      pushToast({ title: 'Premium sound locked', detail: `${sound.name} is included in VIP Sound Library.`, tone: 'info' });
      return;
    }
    const asset = createGeneratedSoundAsset(sound);
    onAddClip(asset);
    pushToast({ title: 'Premium sound placed', detail: `${sound.name} was added to the audio track.`, tone: 'success' });
  };

  const previewSound = (sound: typeof soundItems[number]) => {
    const asset = createGeneratedSoundAsset(sound);
    if (!asset.previewUrl) return;
    const audio = new Audio(asset.previewUrl);
    audio.volume = 0.7;
    void audio.play().catch(() => pushToast({ title: 'Sound preview blocked', detail: 'Click again or check Windows audio output.', tone: 'warning' }));
  };

  const installPack = (pack: typeof marketplacePacks[number]) => {
    if (pack.name === 'Creator Essentials') {
      onPanelChange('templates');
      pushToast({ title: 'Creator Essentials opened', detail: 'The free starter pack is ready in Templates.', tone: 'success' });
      return;
    }
    if (pack.name === 'Premium Locked Preview') {
      onPanelChange('effects');
      pushToast({ title: 'Premium preview enabled', detail: 'Drag locked premium effects to preview them on selected clips.', tone: 'success' });
      return;
    }
    if (pack.premium && !hasAnyPremium(premiumAccess)) {
      setShowPremiumOffer(true);
      pushToast({ title: pack.name, detail: 'This pack is available with Edify Premium.', tone: 'info' });
      return;
    }
    pushToast({ title: 'Pack installed', detail: `${pack.name} is ready in the library.`, tone: 'success' });
  };

  return (
    <aside className="left-sidebar" onClick={() => setAssetMenu(null)}>
      <nav className="rail">
        <div className="rail-main">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={activePanel === section.id ? 'active' : ''}
                key={section.id}
                title={section.label}
                onClick={() => onPanelChange(section.id)}
              >
                <Icon size={18} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
        <button
          className="rail-account-button"
          title="Open account center"
          onClick={onOpenAccount}
        >
          <CircleUserRound size={18} />
          <span>Account</span>
          <small>Sign in</small>
        </button>
      </nav>

      <section className="asset-panel">
        <div className="panel-heading">
          <span>{sections.find((section) => section.id === activePanel)?.label ?? 'Media'}</span>
          <small>{project.assets.length} assets</small>
        </div>
        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library" />
        </label>

        {activePanel === 'suite' && (
          <div className="feature-stack suite-hub-panel">
            <div className="sidebar-hero-card suite-hero-card">
              <span className="premium-hero-icon"><Rocket size={18} /></span>
              <h3>Edify 0.2 Creative Suite</h3>
              <p>Launch the next generation tools from one place: Magic Edit, captions, thumbnail, audio, marketplace, cloud, review, color, motion, and templates.</p>
              <div className="suite-hub-stats">
                <span><strong>10</strong><small>major systems</small></span>
                <span><strong>{project.tracks.flatMap((track) => track.clips).length}</strong><small>timeline clips</small></span>
                <span><strong>{accountUser ? 'On' : 'Off'}</strong><small>cloud profile</small></span>
              </div>
            </div>
            <div className="suite-module-grid">
              {suiteLaunchModules.map((module) => (
                <button className="suite-module-card" key={module.id} type="button" onClick={() => runSuiteModule(module.id)}>
                  <span>{module.badge}</span>
                  <strong>{module.name}</strong>
                  <small>{module.detail}</small>
                </button>
              ))}
            </div>
            <div className="suite-hub-roadmap">
              <strong>0.2 workflow</strong>
              <span>Import clips, run Magic Edit, polish captions, grade color, clean audio, review, then export.</span>
            </div>
          </div>
        )}

        {(activePanel === 'media' || activePanel === 'assets' || activePanel === 'audio') && (
          <>
            <button className="import-tile" onClick={onImportMedia}>
              <BadgePlus size={18} />
              Import local media
              <small>Drag from Explorer or select files</small>
            </button>
            {activePanel === 'audio' && (
              <>
                <div className="sidebar-hero-card sound-hero-card">
                  <AudioLines size={18} />
                  <h3>Audio Studio</h3>
                  <p>Import tracks, preview waveform energy, normalize, denoise, remove silence, and prep voice or music mixes.</p>
                </div>
                <div className="action-card-grid">
                  {audioStudioCards.map((item) => (
                    <button className="action-card" key={item.name} onClick={() => runStudioFeatureById(item.feature)}>
                      <strong>{item.name}</strong>
                      <span>{item.detail}</span>
                      <small>Audio tool</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="asset-list">
              {filteredAssets.map((asset) => (
                <button
                  className="asset-card"
                  key={asset.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-edify-asset', asset.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onContextMenu={(event) => openAssetMenu(event, asset)}
                  onDoubleClick={() => onAddClip(asset)}
                >
                  <span className={`asset-thumb kind-${asset.kind}`}>
                    {asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt="" />
                    ) : asset.previewUrl && asset.kind === 'video' ? (
                      <video src={asset.previewUrl} muted playsInline />
                    ) : asset.previewUrl && asset.kind === 'image' ? (
                      <img src={asset.previewUrl} alt="" />
                    ) : (
                      <span>{asset.extension ?? asset.kind}</span>
                    )}
                  </span>
                  <span className="asset-meta">
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.kind.toUpperCase()} {asset.duration ? `- ${asset.duration}s` : ''} {asset.size ? `- ${formatBytes(asset.size)}` : ''}
                    </small>
                  </span>
                </button>
              ))}
              {filteredAssets.length === 0 && (
                <div className="empty-state compact">No assets match that search.</div>
              )}
            </div>
          </>
        )}

        {activePanel === 'stickers' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card sticker-hero-card">
              <ImagePlus size={18} />
              <h3>Sticker Studio</h3>
              <p>Fast overlays, arrows, badges, social labels, and callouts you can drag into the timeline.</p>
            </div>
            <PresetGrid
              items={filteredStickerItems}
              actionLabel="Place"
              dragKind="sticker"
              onSelect={(name) => onAddText(name, undefined, undefined, stickerGlyphContent(name), 3)}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              previewForItem={stickerContent}
            />
            {filteredStickerItems.length === 0 && <div className="empty-state compact">No stickers match that search.</div>}
          </div>
        )}

        {activePanel === 'favorites' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card favorite-hero-card">
              <Star size={18} />
              <h3>Favorites</h3>
              <p>Star your favorite effects, transitions, text styles, and premium previews for fast access.</p>
            </div>
            <div className="preset-grid">
              {favoritePresets.map((item) => (
                <article
                  className={`preset-tile preset-${item.kind === 'premium' ? 'effect premium-preset premium-locked' : item.kind === 'premium-transition' ? 'transition premium-preset premium-locked' : item.kind === 'premium-text' ? 'text premium-preset premium-locked' : item.kind === 'premium-text-animation' || item.kind === 'premium-filter' || item.kind === 'premium-caption' ? 'effect premium-preset premium-locked' : item.kind} preset-${slugify(item.name)}`}
                  key={favoriteKey(item.kind, item.name)}
                  draggable
                  onClick={() => {
                    if (item.kind === 'sticker') onAddText(item.name, undefined, undefined, stickerGlyphContent(item.name), 3);
                    else if (item.kind === 'text' || item.kind === 'premium-text') onAddText(item.name);
                    else if (item.kind === 'transition' || item.kind === 'premium-transition') onAddTransition(item.name);
                    else onAddEffect(item.name);
                  }}
                  onDragStart={(event) => {
                    const dragKind = item.kind === 'premium' ? 'effect' : item.kind === 'premium-transition' ? 'transition' : item.kind === 'premium-text' ? 'text' : item.kind === 'premium-text-animation' || item.kind === 'premium-filter' || item.kind === 'premium-caption' ? 'effect' : item.kind;
                    event.dataTransfer.setData(`application/x-edify-${dragKind}`, item.name);
                    event.dataTransfer.setData('application/x-edify-preset-kind', dragKind);
                    event.dataTransfer.setData('application/x-edify-preset-name', item.name);
                    if (dragKind === 'sticker') {
                      event.dataTransfer.setData('application/x-edify-preset-content', stickerGlyphContent(item.name));
                    }
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <button
                    className="favorite-button active"
                    title="Remove favorite"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(item.kind, item.name);
                    }}
                  >
                    <Star size={13} />
                  </button>
                  <span className="preset-visual" aria-hidden="true"><i /></span>
                  <span>{item.name}</span>
                  <small>{item.kind.startsWith('premium') ? 'Preview' : 'Apply'}</small>
                </article>
              ))}
              {favoritePresets.length === 0 && <div className="empty-state compact">Click the star on any preset to keep it here.</div>}
            </div>
          </div>
        )}

        {activePanel === 'quick' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card">
              <Rocket size={18} />
              <h3>Magic Edit 3.0</h3>
              <p>Build a full first cut with music, hook, captions, transitions, title stack, social format, and fast polish.</p>
            </div>
            <div className="assistant-score-card score-good">
              <Gauge size={18} />
              <strong>Montage builder</strong>
              <span>Auto music, cuts, captions, transitions, hook, and social format suggestions.</span>
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Sparkles size={15} />
              <span>Magic Edit</span>
            </div>
            <div className="action-card-grid">
              {magicEditStyles.map((style) => (
                <button className="action-card magic-action-card" key={style.id} onClick={() => runMagicEdit(style.id)}>
                  <strong>{style.name}</strong>
                  <span>{style.detail}</span>
                  <small>Build timeline</small>
                </button>
              ))}
            </div>
            <button className="primary-button" onClick={runBeatSync}>
              <Wand2 size={15} />
              Beat Sync timeline
            </button>
            <div className="action-card-grid">
              <button className="action-card" onClick={() => runStudioFeatureById('hook-generator')}>
                <strong>Hook opener</strong>
                <span>Build a stronger first second with bold titles and impact motion.</span>
                <small>Lead with a hook</small>
              </button>
              <button className="action-card" onClick={() => runStudioFeatureById('smart-timeline')}>
                <strong>Smart timeline</strong>
                <span>Suggest cut points, moment markers, and transition placement.</span>
                <small>Assist</small>
              </button>
              <button className="action-card" onClick={() => runStudioFeatureById('auto-reframe')}>
                <strong>Auto format</strong>
                <span>Switch between landscape, square, social, and vertical layouts.</span>
                <small>Reframe</small>
              </button>
            </div>
            <div className="action-card-grid">
              {quickModes.map((mode) => (
                <button className="action-card" key={mode.name} onClick={() => runQuickMode(mode)}>
                  <strong>{mode.name}</strong>
                  <span>{mode.detail}</span>
                  <small>{mode.effects.length} effects + text</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {activePanel === 'ai' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card ai-hero-card">
              <Bot size={18} />
              <h3>Edify AI Lab</h3>
              <p>Fast local-first helpers with clean placeholder architecture for heavier AI later.</p>
            </div>
            <div className="ai-assistant-card">
              <div>
                <strong>Project Assistant</strong>
                <span>{assistantInsights.length} live suggestions</span>
              </div>
              {assistantInsights.map((insight) => (
                <article className={`assistant-insight insight-${insight.tone}`} key={insight.title}>
                  <strong>{insight.title}</strong>
                  <small>{insight.detail}</small>
                </article>
              ))}
              <div className="assistant-actions">
                <button onClick={() => runMagicEdit('creator')}>Fix with Magic</button>
                <button onClick={runBeatSync}>Beat Sync</button>
                <button onClick={generateStylishCaptions}>Stylish captions</button>
              </div>
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Stars size={15} />
              <span>Major Studio Systems</span>
            </div>
            <div className="major-feature-grid">
              {studioFeatureCards.map((feature) => (
                <button className="major-feature-card" key={feature.id} onClick={() => runStudioFeature(feature)}>
                  <strong>{feature.name}</strong>
                  <small>{feature.detail}</small>
                </button>
              ))}
            </div>
            <div className="action-card-grid">
              {aiTools.map((tool) => (
                <button className={`action-card ${tool.premium ? 'is-premium-ai' : ''}`} key={tool.name} onClick={() => runAiTool(tool)}>
                  <strong>{tool.premium && <Crown size={13} />}{tool.name}</strong>
                  <span>{tool.detail}</span>
                  <small>{tool.premium ? (hasAnyPremium(premiumAccess) ? 'Premium active' : 'Premium AI') : 'Free tool'}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {activePanel === 'assistant' && (
          <div className="feature-stack assistant-studio-panel">
            <div className="sidebar-hero-card ai-hero-card">
              <BrainCircuit size={18} />
              <h3>Central Assistant</h3>
              <p>One command center for project diagnosis, rhythm, captions, privacy, export, and creator polish.</p>
            </div>
            <div className={`assistant-score-card score-${moderationReport.score >= 80 ? 'good' : moderationReport.score >= 55 ? 'warn' : 'danger'}`}>
              <Gauge size={18} />
              <strong>{moderationReport.score}/100</strong>
              <span>{allProjectClips(project).length} clips scanned - {assistantInsights.length} live ideas</span>
            </div>
            <div className="assistant-command-grid">
              <button className="primary-button" onClick={applyReviewFixAll}>
                <ShieldCheck size={15} />
                Fix all project issues
              </button>
              <button className="secondary-button" onClick={() => runStudioFeatureById('smart-timeline')}>
                <Sparkles size={15} />
                Smart timeline pass
              </button>
              <button className="secondary-button" onClick={() => runMagicEdit('creator')}>
                <Wand2 size={15} />
                Magic Edit
              </button>
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <BrainCircuit size={15} />
              <span>Major assistant actions</span>
            </div>
            <div className="action-card-grid">
              <button className="action-card" onClick={() => applyReviewTool('hook')}><strong>Hook Doctor</strong><span>Creates a stronger first second with title and punch.</span><small>Improve intro</small></button>
              <button className="action-card" onClick={() => runStudioFeatureById('b-roll-finder')}><strong>B-roll Finder</strong><span>Marks slow parts and adds B-roll placeholders.</span><small>Find gaps</small></button>
              <button className="action-card" onClick={() => runStudioFeatureById('auto-reframe')}><strong>Auto Reframe</strong><span>Switches to vertical format and keeps the subject centered.</span><small>9:16</small></button>
              <button className="action-card" onClick={() => applyReviewTool('scene-cleanup')}><strong>Scene Cleanup</strong><span>Applies color, clarity, pacing and audio cleanup helpers.</span><small>Clean edit</small></button>
              <button className="action-card" onClick={() => generateStylishCaptions()}><strong>Caption Styler</strong><span>Builds animated short-form captions from project text.</span><small>Stylize</small></button>
              <button className="action-card" onClick={() => applyReviewTool('export-optimizer')}><strong>Export Optimizer</strong><span>Tags the project for smarter bitrate, fps and platform settings.</span><small>Optimize</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('privacy')}><strong><Crown size={13} /> Privacy Pass</strong><span>Adds face blur and personal-info cleanup effects.</span><small>Protect</small></button>
              <button className="action-card is-premium-ai" onClick={() => runStudioFeatureById('style-transfer')}><strong><Crown size={13} /> Style Transfer</strong><span>Copies the selected clip style across matching clips.</span><small>Apply style</small></button>
            </div>
          </div>
        )}

        {activePanel === 'moderation' && (
          <div className="feature-stack review-panel">
            <div className="sidebar-hero-card review-hero-card">
              <ShieldCheck size={18} />
              <h3>Review & Safety</h3>
              <p>Scan before export, captions, copyright, privacy, audio loudness, and social safe zones.</p>
            </div>
            <div className={`review-score-card score-${moderationReport.score >= 80 ? 'good' : moderationReport.score >= 55 ? 'warn' : 'danger'}`}>
              <strong>{moderationReport.score}</strong>
              <span>Project safety score</span>
              <small>{moderationReport.summary.danger} danger - {moderationReport.summary.warning} warning - {moderationReport.summary.premium} pro</small>
            </div>
            <button className="primary-button" onClick={applyReviewFixAll}>
              <ShieldCheck size={15} />
              Fix all
            </button>
            <div className="review-issue-list">
              {moderationReport.issues.map((issue) => (
                <article className={`review-issue issue-${issue.tone}`} key={issue.id}>
                  <span>{issue.premium ? <Crown size={13} /> : issue.tone === 'ok' ? <CheckCircle2 size={13} /> : <ShieldCheck size={13} />}</span>
                  <div>
                    <strong>{issue.title}</strong>
                    <small>{issue.detail}</small>
                  </div>
                </article>
              ))}
            </div>
            <div className="premium-inline-heading">
              <Crown size={15} />
              <span>Premium safety tools</span>
            </div>
            <div className="action-card-grid">
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('ai-safety')}><strong><Crown size={13} /> AI Safety Check Pro</strong><span>Runs the full pre-export safety pass and applies quick fixes.</span><small>Scan + fix</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('caption-clean')}><strong><Crown size={13} /> Caption Clean Pro</strong><span>Censor sensitive words, phone, email, and address-like text.</span><small>Apply</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('loudness')}><strong><Crown size={13} /> Audio Loudness Pro</strong><span>Normalize volume, denoise, and add quick fades.</span><small>-14 LUFS style</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('privacy')}><strong><Crown size={13} /> Face Blur / Privacy</strong><span>Add privacy blur effects for faces, plates, names, and personal info.</span><small>Apply blur</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('brand-safe')}><strong><Crown size={13} /> Brand Safe Mode</strong><span>Softens aggressive words, effects, and adds creator-safe polish.</span><small>Brand clean</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('copyright')}><strong><Crown size={13} /> Copyright Assistant</strong><span>Tags audio for licence review: safe, verify, or premium licence.</span><small>Check audio</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('export-compliance')}><strong><Crown size={13} /> Export Compliance</strong><span>Prepare safe-zone guides for TikTok, Shorts, Reels, and client preview.</span><small>Apply</small></button>
              <button className="action-card is-premium-ai" onClick={() => applyReviewTool('auto-blur')}><strong><Crown size={13} /> AI Auto Blur</strong><span>Prepares privacy blur for faces, names, emails, plates, and handles.</span><small>Privacy pass</small></button>
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Bot size={15} />
              <span>AI review helpers</span>
            </div>
            <div className="action-card-grid">
              <button className="action-card" onClick={() => applyReviewTool('hook')}><strong>AI Hook Score</strong><span>Adds a stronger first-second title and punch effect.</span><small>Improve opener</small></button>
              <button className="action-card" onClick={() => applyReviewTool('thumbnail')}><strong>AI Thumbnail Picker</strong><span>Prepares a candidate frame and thumbnail text marker.</span><small>Pick frame</small></button>
              <button className="action-card" onClick={() => applyReviewTool('viral-caption')}><strong>AI Viral Caption</strong><span>Adds punchier subtitle hooks in a short-form style.</span><small>Add captions</small></button>
              <button className="action-card" onClick={() => applyReviewTool('bleep')}><strong>AI Bleep / Censure</strong><span>Masks risky words and adds a visible censure cue.</span><small>Censor</small></button>
              <button className="action-card" onClick={() => applyReviewTool('export-optimizer')}><strong>AI Export Optimizer</strong><span>Tags the project for smarter bitrate, fps, and platform export.</span><small>Optimize</small></button>
              <button className="action-card" onClick={() => applyReviewTool('scene-cleanup')}><strong>AI Scene Cleanup</strong><span>Applies quick color, clarity, pacing, and audio cleanup helpers.</span><small>Clean</small></button>
              <button className="action-card" onClick={() => applyReviewTool('safe-mode')}><strong>Safe Edit Mode</strong><span>Softens aggressive words/effects for a safer version.</span><small>Enable</small></button>
              <button className="action-card" onClick={() => pushToast({ title: 'Client review prepared', detail: 'Use free export with watermark for review previews.', tone: 'info' })}><strong>Client Review Link</strong><span>Prepares a watermark preview workflow for client review.</span><small>Preview mode</small></button>
            </div>
          </div>
        )}

        {activePanel === 'render' && (
          <div className="feature-stack render-studio-panel">
            <div className="sidebar-hero-card render-hero-card">
              <Cpu size={18} />
              <h3>Render Engine</h3>
              <p>FFmpeg timeline render, MP4 output, audio mix, captions burn, watermark logic, and preview cache tools.</p>
            </div>
            <div className="render-engine-card">
              <div>
                <strong>FFmpeg compositor</strong>
                <span>Timeline video layers, images, generated clips, text, mixed audio, watermark, bitrate and fps.</span>
              </div>
              <button className="primary-button" onClick={onExport}>
                <FileVideo size={15} />
                Open MP4 export
              </button>
            </div>
            <div className="render-pipeline-grid">
              {[
                ['Timeline compositor', 'Video, image, text and overlay layers are rendered in track order.'],
                ['Audio mixer', 'Audio/video clips are delayed, mixed and exported with AAC or Opus.'],
                ['Caption burn', 'Text clips can be burned directly into the final video.'],
                ['Premium watermark', 'Free exports keep the Edify badge, Premium removes it.'],
                ['Render history', 'Recent exports stay available from the export modal.'],
                ['Fallback media', 'Missing demo media renders a clean generated placeholder.']
              ].map(([title, detail]) => (
                <article className="render-pipeline-card" key={title}>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </article>
              ))}
            </div>
            <div className="action-card-grid">
              <button className="action-card" onClick={() => runStudioFeatureById('export-intelligent')}><strong>Smart Export Setup</strong><span>Recommends platform format, fps, resolution and bitrate.</span><small>Prepare</small></button>
              <button className="action-card" onClick={() => runStudioFeatureById('preview-cache')}><strong>Render Preview Cache</strong><span>Marks heavy moments for smoother playback preview.</span><small>Cache</small></button>
              <button className="action-card" onClick={() => applyReviewTool('export-compliance')}><strong>Social Compliance</strong><span>Adds safe-zone guides for Shorts, Reels and TikTok.</span><small>Check</small></button>
              <button className="action-card is-premium-ai" onClick={() => setShowPremiumOffer(true)}><strong><Crown size={13} /> Ultra Render Path</strong><span>Premium 4K, 60fps, high bitrate and watermark-free output.</span><small>Premium</small></button>
            </div>
          </div>
        )}

        {activePanel === 'voice' && (
          <div className="feature-stack voice-studio-panel">
            <div className="sidebar-hero-card voice-hero-card">
              <Mic2 size={18} />
              <h3>Voice Studio</h3>
              <p>Record voice, generate real mic captions, clean dialogue, remove silence, duck music, and prep podcast audio.</p>
            </div>
            <div className="assistant-command-grid">
              <button className={isRecordingVoice ? 'danger-button' : 'primary-button'} onClick={onRecordVoice}>
                <Mic2 size={15} />
                {isRecordingVoice ? 'Stop recording' : 'Record voice'}
              </button>
              <button className={isCaptioning ? 'danger-button' : 'secondary-button'} onClick={toggleAutoCaptions}>
                <Captions size={15} />
                {isCaptioning ? 'Stop live captions' : 'Live mic captions'}
              </button>
              <button className="secondary-button" onClick={generateStylishCaptions}>
                <Sparkles size={15} />
                Stylish captions
              </button>
            </div>
            <textarea
              className="caption-draft voice-transcript-box"
              value={captionDraft}
              onChange={(event) => setCaptionDraft(event.target.value)}
              placeholder="Paste a transcript here, then generate captions."
            />
            <div className="action-card-grid">
              <button className="action-card" onClick={() => runVoicePreset('Studio Voice', ['Studio Voice', 'Clean Voice Boost', 'Denoise'])}><strong>Studio Voice</strong><span>Cleaner voice with denoise and clarity boost.</span><small>Enhance</small></button>
              <button className="action-card" onClick={() => runVoicePreset('Remove Silence', ['Remove Silence', 'Audio Tight Cut', 'Fade Polish'])}><strong>Remove Silence</strong><span>Prepares cut markers and short fades for empty parts.</span><small>Cut gaps</small></button>
              <button className="action-card" onClick={() => runVoicePreset('Podcast Clean', ['Podcast Clean', 'Normalize', 'Warm Voice EQ'])}><strong>Podcast Clean</strong><span>Balanced creator voice for commentary and tutorials.</span><small>Clean</small></button>
              <button className="action-card" onClick={() => runVoicePreset('Music Ducking', ['Auto Duck Music', 'Voice Priority Mix'])}><strong>Music Ducking</strong><span>Lowers music under voice sections.</span><small>Mix</small></button>
              <button className="action-card" onClick={() => runVoicePreset('Voice Changer', ['Pitch Polish', 'Formant Shift', 'Character Voice'])}><strong>Voice Changer</strong><span>Pitch and formant effects for fun creator edits.</span><small>Change</small></button>
              <button className="action-card is-premium-ai" onClick={() => runStudioFeatureById('voice-tools')}><strong><Crown size={13} /> Voice Tools Pro</strong><span>Full voice tool chain with denoise, normalize, silence and pitch.</span><small>Pro chain</small></button>
            </div>
          </div>
        )}

        {activePanel === 'sounds' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card sound-hero-card">
              <Music2 size={18} />
              <h3>Sound Library</h3>
              <p>Drag-ready sound ideas for impacts, risers, ambience, and transitions.</p>
            </div>
            <div className="sound-list">
              {filteredPremiumSounds.map((sound) => (
                <div
                  className={`sound-row premium-sound-row ${hasAnyPremium(premiumAccess) ? 'premium-unlocked' : 'premium-locked'}`}
                  key={sound.name}
                  draggable={hasAnyPremium(premiumAccess)}
                  onDragStart={(event) => {
                    if (!hasAnyPremium(premiumAccess)) return;
                    event.dataTransfer.setData('application/x-edify-sound', sound.name);
                    event.dataTransfer.setData('application/x-edify-sound-duration', String(sound.duration));
                    event.dataTransfer.setData('application/x-edify-sound-tag', sound.tag);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <button className="sound-main" onClick={() => addPremiumSoundToTimeline(sound)}>
                    <span className="premium-badge" title="Premium"><Crown size={12} /></span>
                    <SoundWave name={sound.name} tag={sound.tag} duration={sound.duration} premium />
                    <span>
                      <strong>{sound.name}</strong>
                      <small>{sound.tag} - {sound.duration.toFixed(1)}s</small>
                    </span>
                  </button>
                  <button className="icon-button sound-preview-button" title="Preview sound" onClick={() => previewSound(sound)}>
                    <Play size={14} />
                  </button>
                </div>
              ))}
              {filteredSounds.map((sound) => (
                <div
                  className="sound-row"
                  key={sound.name}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-edify-sound', sound.name);
                    event.dataTransfer.setData('application/x-edify-sound-duration', String(sound.duration));
                    event.dataTransfer.setData('application/x-edify-sound-tag', sound.tag);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <button className="sound-main" onClick={() => addSoundToTimeline(sound)}>
                    <SoundWave name={sound.name} tag={sound.tag} duration={sound.duration} />
                    <span>
                      <strong>{sound.name}</strong>
                      <small>{sound.tag} - {sound.duration.toFixed(1)}s</small>
                    </span>
                  </button>
                  <button className="icon-button sound-preview-button" title="Preview sound" onClick={() => previewSound(sound)}>
                    <Play size={14} />
                  </button>
                </div>
              ))}
              {filteredSounds.length === 0 && <div className="empty-state compact">No sounds match that search.</div>}
            </div>
          </div>
        )}

        {activePanel === 'templates' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card market-hero-card">
              <Gift size={18} />
              <h3>Video Templates</h3>
              <p>Full edit recipes with format, title, captions, effects, transitions, and markers.</p>
            </div>
            <div className="video-template-grid">
              {videoTemplateItems.map((template) => (
                <button className={`video-template-card template-${template.id}`} key={template.id} onClick={() => runVideoTemplate(template.id)}>
                  <strong>{template.name}</strong>
                  <span>{template.detail}</span>
                  <small>Apply template</small>
                </button>
              ))}
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Layers size={15} />
              <span>Complete template systems</span>
            </div>
            <div className="action-card-grid">
              {completeTemplatePacks.map((template) => (
                <button className="action-card template-system-card" key={template.name} onClick={() => runStudioFeatureById(template.feature)}>
                  <strong>{template.name}</strong>
                  <span>{template.detail}</span>
                  <small>Build system</small>
                </button>
              ))}
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <ShoppingBag size={15} />
              <span>Template bundles</span>
            </div>
            <div className="action-card-grid">
              {marketplaceBundles.map((bundle) => (
                <button className="action-card template-system-card" key={bundle.name} onClick={() => runStudioFeatureById(bundle.action)}>
                  <strong>{bundle.name}</strong>
                  <span>{bundle.detail}</span>
                  <small>Bundle flow</small>
                </button>
              ))}
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Gift size={15} />
              <span>Creator Essentials</span>
            </div>
            {creatorEssentialsPresets.map((template) => (
              <button
                className="template-row"
                key={template}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-edify-template', template);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => {
                  if (template === 'Whoosh Sweep') {
                    addSoundToTimeline(soundItems[0]);
                    return;
                  }
                  if (template.includes('Lower') || template.includes('Subtitle')) {
                    onAddText(template);
                    return;
                  }
                  onAddEffect(template);
                }}
              >
                <Stars size={16} />
                {template}
              </button>
            ))}
          </div>
        )}

        {activePanel === 'text' && (
          <>
            <div className="premium-inline-heading">
              <Crown size={15} />
              <span>VIP text templates</span>
            </div>
            <PremiumPresetGrid
              items={premiumTextQueryItems}
              canUse={canUsePremium}
              onSelect={onAddText}
              onLocked={handleLockedPremiumText}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="text"
              favoriteKind="premium-text"
            />
            <div className="premium-inline-heading">
              <Sparkles size={15} />
              <span>VIP text animations</span>
            </div>
            <PremiumPresetGrid
              items={premiumTextAnimationQueryItems}
              canUse={canUsePremium}
              onSelect={onAddEffect}
              onLocked={handleLockedPremiumTextAnimation}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="effect"
              favoriteKind="premium-text-animation"
            />
            <div className="premium-inline-heading free-inline-heading">
              <Subtitles size={15} />
              <span>Text templates</span>
            </div>
            <PresetGrid
              items={textPresets}
              actionLabel="Add"
              dragKind="text"
              onSelect={onAddText}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
            />
            <div className="premium-inline-heading free-inline-heading">
              <Sparkles size={15} />
              <span>Text animations</span>
            </div>
            <PresetGrid
              items={textAnimationPresets}
              actionLabel={selectedClip?.kind === 'text' ? 'Apply' : 'Select text'}
              dragKind="effect"
              onSelect={onAddEffect}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
            />
          </>
        )}

        {activePanel === 'effects' && (
          <>
            <div className="premium-inline-heading">
              <Crown size={15} />
              <span>Premium packs first</span>
            </div>
            <PremiumPresetGrid
              items={premiumQueryItems}
              canUse={canUsePremium}
              onSelect={onAddEffect}
              onLocked={handleLockedPremium}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="effect"
              favoriteKind="premium"
            />
            <div className="premium-inline-heading free-inline-heading">
              <Sparkles size={15} />
              <span>Free effects</span>
            </div>
            <PresetGrid
              items={effectPresets}
              actionLabel={selectedClip ? 'Apply' : 'Select clip'}
              dragKind="effect"
              onSelect={onAddEffect}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
            />
          </>
        )}

        {activePanel === 'transitions' && (
          <>
            <div className="premium-inline-heading">
              <Crown size={15} />
              <span>VIP transitions</span>
            </div>
            <PremiumPresetGrid
              items={premiumTransitionQueryItems}
              canUse={canUsePremium}
              onSelect={onAddTransition}
              onLocked={handleLockedPremiumTransition}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="transition"
              favoriteKind="premium-transition"
            />
            <div className="premium-inline-heading free-inline-heading">
              <Wand2 size={15} />
              <span>Free transitions</span>
            </div>
            <PresetGrid
              items={transitionPresets}
              actionLabel={selectedClip ? 'Add' : 'Select clip'}
              dragKind="transition"
              onSelect={onAddTransition}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
            />
          </>
        )}

        {activePanel === 'filters' && (
          <>
            <div className="premium-inline-heading">
              <Crown size={15} />
              <span>VIP filters</span>
            </div>
            <PremiumPresetGrid
              items={premiumFilterQueryItems}
              canUse={canUsePremium}
              onSelect={onAddEffect}
              onLocked={handleLockedPremiumFilter}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="effect"
              favoriteKind="premium-filter"
            />
            <div className="premium-inline-heading free-inline-heading">
              <Palette size={15} />
              <span>Free filters</span>
            </div>
            <PresetGrid
              items={filterPresets}
              actionLabel="Apply"
              dragKind="filter"
              onSelect={onAddEffect}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
            />
          </>
        )}

        {activePanel === 'captions' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card ai-hero-card">
              <Captions size={18} />
              <h3>Caption Studio</h3>
              <p>Real creator-style captions, word-punch presets, censure helpers, live mic captions, and social-safe subtitle layouts.</p>
            </div>
            <div className="premium-inline-heading">
              <Crown size={15} />
              <span>VIP caption styles</span>
            </div>
            <PremiumPresetGrid
              items={premiumCaptionQueryItems}
              canUse={canUsePremium}
              onSelect={(name) => onAddText(name, undefined, undefined, name.replace(/ Pro| Captions| Caption/g, ''), 3.6)}
              onLocked={handleLockedPremiumCaption}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="text"
              favoriteKind="premium-caption"
            />
            <textarea
              className="caption-draft"
              value={captionDraft}
              onChange={(event) => setCaptionDraft(event.target.value)}
              placeholder="Paste a transcript, or leave empty to build captions from the selected clip name."
            />
            <div className="action-card-grid">
              {captionStyleCards.map((style) => (
                <button className="action-card" key={style.name} onClick={() => onAddText(style.name, undefined, undefined, style.name.toUpperCase(), 2.8)}>
                  <strong>{style.name}</strong>
                  <span>{style.detail}</span>
                  <small>Caption style</small>
                </button>
              ))}
            </div>
            <button className="primary-button" onClick={generateSmartCaptions}>Generate captions on timeline</button>
            <button className="primary-button" onClick={generateStylishCaptions}>Generate stylish auto captions</button>
            <button className={isCaptioning ? 'danger-button' : 'primary-button'} onClick={toggleAutoCaptions}>
              {isCaptioning ? 'Stop live mic captions' : 'Start live mic captions'}
            </button>
            <button className="secondary-button" onClick={() => onAddText('Subtitle')}>Add subtitle clip</button>
            <div className="action-card-grid">
              <button className="action-card" onClick={() => applyReviewTool('caption-clean')}>
                <strong>Caption clean</strong>
                <span>Censor sensitive words and keep subtitles readable and safe.</span>
                <small>Clean text</small>
              </button>
              <button className="action-card" onClick={() => applyReviewTool('viral-caption')}>
                <strong>Viral caption pass</strong>
                <span>Push punchier short-form timing and stronger emphasis.</span>
                <small>Stylize</small>
              </button>
            </div>
          </div>
        )}

        {activePanel === 'premium' && (
          <div className="feature-stack premium-panel">
            <div className="premium-hero-card">
              <span className="premium-hero-icon"><Crown size={18} /></span>
              <h3>Edify Premium Studio</h3>
              <p>Premium packs for cinematic edits, viral shorts, creator glow, and pro export presets.</p>
              <div className="premium-status-pill">
                <Crown size={13} />
                {sponsoredStatusLabel}
              </div>
            </div>
            <button className="primary-button premium-buy-button" onClick={() => setShowPremiumOffer(true)}>
              <Crown size={16} />
              Acheter Premium
            </button>
            <div className="sponsored-trial-card">
              <div>
                <span><Sparkles size={14} /> Sponsored Trial</span>
                <strong>{sponsoredStrongLabel}</strong>
                <small>{sponsoredSmallLabel}</small>
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  if (!canStartDailySponsored && !pendingSponsoredClaim && !sponsorSeriesProgress && !hasSponsoredReward) {
                    pushToast({
                      title: 'Daily unlock already used',
                      detail: 'Your next sponsored reward series will be available tomorrow.',
                      tone: 'warning'
                    });
                    return;
                  }
                  setShowSponsoredUnlock(true);
                }}
                disabled={!canStartDailySponsored && !pendingSponsoredClaim && !sponsorSeriesProgress && !hasSponsoredReward}
              >
                {sponsoredButtonLabel}
              </button>
            </div>
            {(pendingSponsoredClaim || sponsorSeriesProgress || (!canStartDailySponsored && !hasSponsoredReward)) && (
              <div className="premium-active-note sponsored-status-note">
                {pendingSponsoredClaim
                  ? 'Reward locker active: your choice is saved until you come back.'
                  : sponsorSeriesProgress
                    ? 'Sponsor series progress was saved. You can resume where you left off.'
                    : 'Daily sponsor unlock already used on this device. It resets tomorrow.'}
              </div>
            )}
            {hasSponsoredReward && (
              <div className="sponsored-unlocked-list">
                {sponsoredRewardItems.slice(0, 5).map((item) => (
                  <span key={item}><Crown size={11} /> {item}</span>
                ))}
              </div>
            )}
            {rewardHistory.length > 0 && (
              <div className="sponsored-history-list">
                <h3>Reward history</h3>
                {rewardHistory.map((entry) => (
                  <div className="sponsored-history-item" key={entry.id}>
                    <span>
                      <strong>{entry.chosenPack}</strong>
                      <small>{entry.itemNames.length} items unlocked</small>
                    </span>
                    <em>{new Date(entry.unlockedAt).toLocaleDateString()}</em>
                  </div>
                ))}
              </div>
            )}
            <div className="premium-tools-card">
              <h3>Included premium tools</h3>
              <div className="premium-tool-list">
                <span>Watermark-free exports</span>
                <span>Premium timeline effects</span>
                <span>VIP transition vault</span>
                <span>AI montage helpers</span>
                <span>VIP text studio</span>
                <span>Premium text animations</span>
                <span>VIP sound library</span>
                <span>VIP caption styles</span>
                <span>Premium filter vault</span>
                <span>Creator templates</span>
                <span>Pro export presets</span>
              </div>
            </div>
            <div className="premium-inline-heading">
              <Captions size={15} />
              <span>VIP caption styles</span>
            </div>
            <PremiumPresetGrid
              items={premiumCaptionQueryItems}
              canUse={canUsePremium}
              onSelect={(name) => onAddText(name, undefined, undefined, name.replace(/ Pro| Captions| Caption/g, ''), 3.6)}
              onLocked={handleLockedPremiumCaption}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="text"
              favoriteKind="premium-caption"
            />
            <div className="premium-inline-heading">
              <Palette size={15} />
              <span>VIP filters</span>
            </div>
            <PremiumPresetGrid
              items={premiumFilterQueryItems}
              canUse={canUsePremium}
              onSelect={onAddEffect}
              onLocked={handleLockedPremiumFilter}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="effect"
              favoriteKind="premium-filter"
            />
            <div className="premium-inline-heading">
              <Subtitles size={15} />
              <span>VIP text templates</span>
            </div>
            <PremiumPresetGrid
              items={premiumTextQueryItems}
              canUse={canUsePremium}
              onSelect={onAddText}
              onLocked={handleLockedPremiumText}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="text"
              favoriteKind="premium-text"
            />
            <div className="premium-inline-heading">
              <Sparkles size={15} />
              <span>VIP text animations</span>
            </div>
            <PremiumPresetGrid
              items={premiumTextAnimationQueryItems}
              canUse={canUsePremium}
              onSelect={onAddEffect}
              onLocked={handleLockedPremiumTextAnimation}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="effect"
              favoriteKind="premium-text-animation"
            />
            <div className="premium-inline-heading">
              <Crown size={15} />
              <span>VIP effects</span>
            </div>
            <PremiumPresetGrid
              items={premiumQueryItems}
              canUse={canUsePremium}
              onSelect={onAddEffect}
              onLocked={handleLockedPremium}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="effect"
              favoriteKind="premium"
            />
            <div className="premium-inline-heading">
              <Wand2 size={15} />
              <span>VIP transitions</span>
            </div>
            <PremiumPresetGrid
              items={premiumTransitionQueryItems}
              canUse={canUsePremium}
              onSelect={onAddTransition}
              onLocked={handleLockedPremiumTransition}
              favoriteSet={favoriteSet}
              onToggleFavorite={toggleFavorite}
              presetKind="transition"
              favoriteKind="premium-transition"
            />
            {hasAnyPremium(premiumAccess) && <div className="premium-active-note">Premium is active on this device.</div>}
            {hasSponsoredReward && !hasAnyPremium(premiumAccess) && <div className="premium-active-note">Sponsored Trial is active for selected items only.</div>}
          </div>
        )}

        {activePanel === 'marketplace' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card market-hero-card">
              <ShoppingBag size={18} />
              <h3>Edify Pack Store</h3>
              <p>Premium packs, bundles, previews, creator systems, and extension-ready modules for the next version of Edify.</p>
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Gift size={15} />
              <span>Bundle drops</span>
            </div>
            <div className="action-card-grid">
              {marketplaceBundles.map((bundle) => (
                <button className="action-card market-bundle-card" key={bundle.name} onClick={() => runStudioFeatureById(bundle.action)}>
                  <strong>{bundle.name}</strong>
                  <span>{bundle.detail}</span>
                  <small>Open bundle</small>
                </button>
              ))}
            </div>
            <div className="marketplace-grid">
              {marketplacePacks.map((pack) => (
                <button className={`marketplace-card ${pack.premium ? 'is-premium' : ''}`} key={pack.name} onClick={() => installPack(pack)}>
                  <span>{pack.premium ? <Crown size={14} /> : <CheckCircle2 size={14} />}{pack.price}</span>
                  <strong>{pack.name}</strong>
                  <small>{pack.detail}</small>
                </button>
              ))}
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Cpu size={15} />
              <span>Plugin / extension future</span>
            </div>
            <div className="action-card-grid">
              {pluginModules.map((plugin) => (
                <button className="action-card" key={plugin.name} onClick={() => runStudioFeatureById(plugin.feature)}>
                  <strong>{plugin.name}</strong>
                  <span>{plugin.detail}</span>
                  <small>Prepare slot</small>
                </button>
              ))}
            </div>
            <button className="secondary-button" onClick={() => onPanelChange('premium')}>
              <Crown size={15} />
              Open premium plans
            </button>
          </div>
        )}

        {activePanel === 'color' && (
          <div className="feature-stack">
            <div className="sidebar-hero-card color-hero-card">
              <Palette size={18} />
              <h3>Color Studio</h3>
              <p>Lift / gamma / gain, LUT-inspired looks, scopes, before/after checks, color repair, and export-safe polish.</p>
            </div>
            <div className="color-wheel-strip">
              {[
                ['Lift', 'Shadow anchor'],
                ['Gamma', 'Midtone balance'],
                ['Gain', 'Highlight finish']
              ].map(([label, detail]) => (
                <button className="color-wheel-pill" key={label} onClick={() => applyColorEffect(`${label} Control`)}>
                  <span className={`color-wheel-preview wheel-${slugify(label)}`} />
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </button>
              ))}
            </div>
            <div className="color-slider-card">
              <label>Temperature<input type="range" min="-100" max="100" defaultValue="0" onChange={(event) => {
                const value = Number(event.target.value);
                applyColorEffect(value >= 0 ? 'Warm Tone' : 'Cinematic Cool Tone', value >= 0 ? 'warm-tone' : 'cinematic-cool-tone', Math.abs(value));
              }} /></label>
              <label>Contrast<input type="range" min="0" max="100" defaultValue="18" onChange={(event) => applyColorEffect('Contrast Boost', 'contrast-boost', Number(event.target.value))} /></label>
              <label>Saturation<input type="range" min="0" max="100" defaultValue="12" onChange={(event) => applyColorEffect('Saturation Boost', 'saturation-boost', Number(event.target.value))} /></label>
              <label>Glow<input type="range" min="0" max="100" defaultValue="0" onChange={(event) => applyColorEffect('Glow', 'glow', Number(event.target.value))} /></label>
              <label>Vignette<input type="range" min="0" max="100" defaultValue="26" onChange={(event) => applyColorEffect('Vignette', 'vignette', Number(event.target.value))} /></label>
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Gauge size={15} />
              <span>Scopes</span>
            </div>
            <div className="action-card-grid">
              {colorScopeCards.map((scope) => (
                <button className="action-card color-action-card" key={scope.name} onClick={() => applyColorEffect(scope.effect)}>
                  <strong>{scope.name}</strong>
                  <span>{scope.detail}</span>
                  <small>Visual scope</small>
                </button>
              ))}
            </div>
            <div className="premium-inline-heading">
              <Sparkles size={15} />
              <span>LUT-inspired looks</span>
            </div>
            <div className="action-card-grid">
              {[
                ['Auto Color Match', 'Clean Creator, contrast, and saturation balanced for the selected clip.'],
                ['Teal Orange Deluxe', 'Blockbuster teal shadows and warm highlights.'],
                ['Portra Glow Pro', 'Soft creator skin tone and gentle glow.'],
                ['Noir Luxe', 'Premium black and white contrast.'],
                ['E-Sport Neon Grade', 'Punchy gaming color and extra saturation.'],
                ['Luxury Ad Film', 'Commercial product look with restrained color.'],
                ['Festival Film Print', 'Soft film contrast for cinematic edits.'],
                ['Chrome Pop', 'High-energy pop color for shorts.']
              ].map(([name, detail]) => (
                <button className="action-card color-action-card" key={name} onClick={() => applyColorEffect(name)}>
                  <strong>{name}</strong>
                  <span>{detail}</span>
                  <small>Apply look</small>
                </button>
              ))}
            </div>
            <div className="scope-preview-grid">
              <div className="scope-preview-card waveform-preview"><i /><i /><i /></div>
              <div className="scope-preview-card parade-preview"><i /><i /><i /></div>
              <div className="scope-preview-card vector-preview"><i /></div>
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <Stars size={15} />
              <span>Color repair</span>
            </div>
            <div className="action-card-grid">
              {[
                ['Shadow Lift', 'Open dark areas without washing the whole image.'],
                ['Highlight Roll', 'Smooth bright zones and protect whites.'],
                ['Studio Clean HDR', 'Clean sharp contrast for product and talking head clips.'],
                ['Soft Beauty Diffusion', 'Smooth creator look for faces and lifestyle clips.'],
                ['Background Blur', 'Portrait-to-landscape color depth helper.'],
                ['Film Grain', 'Texture for flat digital footage.']
              ].map(([name, detail]) => (
                <button className="action-card" key={name} onClick={() => applyColorEffect(name)}>
                  <strong>{name}</strong>
                  <span>{detail}</span>
                  <small>Repair</small>
                </button>
              ))}
            </div>
            <div className="premium-inline-heading free-inline-heading">
              <BadgePlus size={15} />
              <span>Clip label colors</span>
            </div>
            <div className="color-swatch-grid">
              {['#2e83ff', '#42e8ff', '#21d19f', '#ffd166', '#ff7a90', '#9f7cff', '#ffffff', '#2ad4a7'].map((color) => (
                <button
                  key={color}
                  className="color-swatch-button"
                  style={{ background: color }}
                  title={color}
                  onClick={() => setClipLabelColor(color)}
                />
              ))}
            </div>
          </div>
        )}

      </section>

      {assetMenu && (
        <div className="context-menu asset-context-menu" style={{ left: assetMenu.x, top: assetMenu.y }}>
          <button
            onClick={() => {
              onAddClip(assetMenu.asset);
              setAssetMenu(null);
            }}
          >
            Add to timeline
          </button>
          <button
            className="danger-menu-item"
            onClick={() => {
              onDeleteAsset(assetMenu.asset.id);
              setAssetMenu(null);
            }}
          >
            <Trash2 size={14} />
            Delete media
          </button>
        </div>
      )}

      {showPremiumOffer && (
        <PremiumOfferModal
          accountUser={accountUser}
          onClose={() => setShowPremiumOffer(false)}
          onConnectAccount={onOpenAccount}
          onAccessChange={setPremiumAccess}
          pushToast={pushToast}
        />
      )}
      {showSponsoredUnlock && (
        <SponsoredUnlockModal
          access={premiumAccess}
          candidates={sponsoredCandidates}
          onAccessChange={setPremiumAccess}
          onClose={() => setShowSponsoredUnlock(false)}
          pushToast={pushToast}
        />
      )}
    </aside>
  );
}

function PresetGrid({
  items,
  actionLabel,
  dragKind,
  onSelect,
  favoriteSet,
  onToggleFavorite,
  previewForItem
}: {
  items: string[];
  actionLabel: string;
  dragKind: 'effect' | 'filter' | 'transition' | 'text' | 'sticker';
  onSelect: (item: string) => void;
  favoriteSet: Set<string>;
  onToggleFavorite: (kind: FavoritePreset['kind'], name: string) => void;
  previewForItem?: (item: string) => string;
}) {
  return (
    <div className="preset-grid">
      {items.map((item) => (
        <article
          className={`preset-tile preset-${dragKind} preset-${slugify(item)}`}
          key={item}
          draggable
          onClick={() => onSelect(item)}
          onDragStart={(event) => {
            event.dataTransfer.setData(`application/x-edify-${dragKind}`, item);
            event.dataTransfer.setData('application/x-edify-preset-kind', dragKind);
            event.dataTransfer.setData('application/x-edify-preset-name', item);
            if (previewForItem) {
              event.dataTransfer.setData('application/x-edify-preset-content', previewForItem(item));
            }
            event.dataTransfer.effectAllowed = 'copy';
            const ghost = document.createElement('div');
            ghost.className = `drag-ghost preset-${dragKind} preset-${slugify(item)}`;
            ghost.textContent = item;
            document.body.appendChild(ghost);
            event.dataTransfer.setDragImage(ghost, 18, 18);
            window.setTimeout(() => ghost.remove(), 0);
          }}
        >
          <button
            className={`favorite-button ${favoriteSet.has(favoriteKey(dragKind, item)) ? 'active' : ''}`}
            title={favoriteSet.has(favoriteKey(dragKind, item)) ? 'Remove favorite' : 'Add favorite'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(dragKind, item);
            }}
          >
            <Star size={13} />
          </button>
          <span className="preset-visual" aria-hidden="true">
            <i>{previewForItem?.(item)}</i>
          </span>
          <span>{item}</span>
          <small>{actionLabel}</small>
        </article>
      ))}
    </div>
  );
}

function PremiumPresetGrid({
  items,
  canUse,
  onSelect,
  onLocked,
  favoriteSet,
  onToggleFavorite,
  presetKind = 'effect',
  favoriteKind = 'premium'
}: {
  items: PremiumEffectPreset[];
  canUse: (item: PremiumEffectPreset) => boolean;
  onSelect: (item: string) => void;
  onLocked: (item: PremiumEffectPreset) => void;
  favoriteSet: Set<string>;
  onToggleFavorite: (kind: FavoritePreset['kind'], name: string) => void;
  presetKind?: 'effect' | 'transition' | 'text';
  favoriteKind?: Extract<FavoritePreset['kind'], 'premium' | 'premium-transition' | 'premium-text' | 'premium-text-animation' | 'premium-filter' | 'premium-caption'>;
}) {
  return (
    <div className="preset-grid premium-preset-grid">
      {items.map((item) => {
        const unlocked = canUse(item);
        return (
          <article
            className={`preset-tile preset-${presetKind} premium-preset ${unlocked ? 'premium-unlocked' : 'premium-locked'} preset-${slugify(item.name)}`}
            key={item.name}
            draggable
            onClick={() => (unlocked ? onSelect(item.name) : onLocked(item))}
            onDragStart={(event) => {
              event.dataTransfer.setData(`application/x-edify-${presetKind}`, item.name);
              event.dataTransfer.setData('application/x-edify-preset-kind', presetKind);
              event.dataTransfer.setData('application/x-edify-preset-name', item.name);
              event.dataTransfer.effectAllowed = 'copy';
              const ghost = document.createElement('div');
              ghost.className = `drag-ghost preset-${presetKind} premium-preset preset-${slugify(item.name)}`;
              ghost.textContent = item.name;
              document.body.appendChild(ghost);
              event.dataTransfer.setDragImage(ghost, 18, 18);
              window.setTimeout(() => ghost.remove(), 0);
            }}
            title={item.description}
          >
            <button
              className={`favorite-button ${favoriteSet.has(favoriteKey(favoriteKind, item.name)) ? 'active' : ''}`}
              title={favoriteSet.has(favoriteKey(favoriteKind, item.name)) ? 'Remove favorite' : 'Add favorite'}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite(favoriteKind, item.name);
              }}
            >
              <Star size={13} />
            </button>
            <span className={`premium-badge ${unlocked ? 'is-unlocked' : ''}`} title={unlocked ? item.pack : 'Premium'}>
              <Crown size={12} />
            </span>
            <span className="preset-visual" aria-hidden="true">
              <i />
            </span>
            <span>{item.name}</span>
            {unlocked && <small>Apply</small>}
          </article>
        );
      })}
      {items.length === 0 && <div className="empty-state compact">No premium {presetKind}s match that search.</div>}
    </div>
  );
}

function soundEnergyLabel(tag: string, duration: number) {
  const key = `${tag} ${duration}`.toLowerCase();
  if (key.includes('hit') || key.includes('impact') || key.includes('drop')) return 'High';
  if (key.includes('logo') || key.includes('ui')) return 'Tight';
  if (key.includes('build') || key.includes('transition') || key.includes('riser')) return 'Rising';
  if (key.includes('ambient') || key.includes('bed') || key.includes('chill')) return 'Soft';
  if (duration >= 10) return 'Loop';
  return 'Medium';
}

function SoundWave({ name, tag, duration, premium = false }: { name: string; tag: string; duration: number; premium?: boolean }) {
  const bars = createWaveformForName(`${name}-${tag}`, 18);
  const energy = soundEnergyLabel(tag, duration);
  return (
    <span className={`sound-wave sound-wave-${slugify(tag)} ${premium ? 'is-premium' : ''}`} aria-hidden="true">
      <span className="sound-wave-bars">
        {bars.map((value, index) => (
          <i key={index} style={{ height: `${Math.max(10, value * 0.34)}px` }} />
        ))}
      </span>
      <span className="sound-wave-meta">
        <b>{energy}</b>
        <em>{tag}</em>
      </span>
    </span>
  );
}

function chunkWords(words: string[], size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size).join(' '));
  }
  return chunks.length > 0 ? chunks : ['Edify automatic caption'];
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
