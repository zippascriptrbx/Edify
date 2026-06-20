import { AudioLines, BadgeHelp, Bot, BrainCircuit, Cpu, Crown, FolderOpen, ImagePlus, Import, LayoutTemplate, LifeBuoy, Mic2, Minus, Music2, Plus, Rocket, ShieldCheck, ShoppingBag, Sparkles, UserRound, Video, Wand2, X } from 'lucide-react';
import { memo, useState } from 'react';
import { edifyApi } from '../../lib/bridge';
import { hasAnyPremium, loadPremiumAccess } from '../../lib/premium';
import type { BootstrapInfo, PanelId, ProjectSummary } from '../../types/edify';

type HomeScreenProps = {
  recentProjects: ProjectSummary[];
  bootstrap: BootstrapInfo | null;
  accountUser?: { email: string; provider: string } | null;
  onNewProject: (name?: string) => void;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onRenameRecent: (project: ProjectSummary) => void;
  onDeleteRecent: (project: ProjectSummary) => void;
  onImportMedia: () => void;
  onOpenPremium: () => void;
  onOpenThumbnailStudio: () => void;
  onOpenAudioEditor: () => void;
  onOpenEdifyStudio: () => void;
  onOpenAccount: () => void;
  onOpenPanel: (panel: PanelId) => void;
  onDropFiles: (files: FileList | File[]) => void;
};

const templates = ['Magic Shorts 3.0', 'Gaming Highlight', 'AI Caption Reel', 'Product Launch', 'Audio Podcast Clip', 'Cinematic Trailer'];
const dashboardCards: Array<{ title: string; detail: string; icon: typeof Rocket; panel: PanelId }> = [
  { title: 'Creator Engine 3.0', detail: '10 major new systems', icon: Sparkles, panel: 'suite' },
  { title: 'Magic Edit 3.0', detail: 'Auto cuts, hooks, captions', icon: Rocket, panel: 'quick' },
  { title: 'Edify Assistant', detail: 'Fix, score, optimize', icon: BrainCircuit, panel: 'assistant' },
  { title: 'AI Caption Studio', detail: 'Word punch subtitles', icon: Bot, panel: 'captions' },
  { title: 'Audio Studio Pro', detail: 'Clean, duck, beat sync', icon: Mic2, panel: 'audio' },
  { title: 'Sound Library', detail: 'Chill music and SFX', icon: Music2, panel: 'sounds' },
  { title: 'Render Engine', detail: 'MP4 and preview cache', icon: Cpu, panel: 'render' },
  { title: 'Client Review', detail: 'Notes and approvals', icon: ShieldCheck, panel: 'moderation' },
  { title: 'Marketplace 2.0', detail: 'Packs, VIP, rewards', icon: ShoppingBag, panel: 'marketplace' }
];

const launchHighlights = [
  { title: 'Magic Edit 3.0 ready', detail: 'Build a timeline with music, cuts, captions, zooms and hooks.', icon: Wand2, panel: 'suite' as PanelId },
  { title: 'AI Caption Studio', detail: 'Word-by-word creator captions, highlights, censure-ready styling.', icon: Music2, panel: 'captions' as PanelId },
  { title: 'Audio Studio Pro', detail: 'Beat detection, voice enhance, silence removal and auto ducking.', icon: Cpu, panel: 'audio' as PanelId }
];

export const HomeScreen = memo(function HomeScreen({
  recentProjects,
  bootstrap,
  accountUser,
  onNewProject,
  onOpenProject,
  onOpenRecent,
  onRenameRecent,
  onDeleteRecent,
  onImportMedia,
  onOpenPremium,
  onOpenThumbnailStudio,
  onOpenAudioEditor,
  onOpenEdifyStudio,
  onOpenAccount,
  onOpenPanel,
  onDropFiles
}: HomeScreenProps) {
  const [recentMenu, setRecentMenu] = useState<{ x: number; y: number; project: ProjectSummary } | null>(null);
  const premiumAccess = loadPremiumAccess();
  const hasPremium = hasAnyPremium(premiumAccess);
  const localProjects = recentProjects.filter((project) => project.source !== 'cloud');
  const cloudProjects = recentProjects.filter((project) => project.source === 'cloud');

  return (
    <main
      className="home-screen"
      onClick={() => setRecentMenu(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropFiles(event.dataTransfer.files);
      }}
    >
      <div className="home-ambient" />
      <div className="home-window-controls">
        <button onClick={() => void edifyApi.windowMinimize()} title="Minimize">
          <Minus size={17} />
        </button>
        <button className="close-window" onClick={() => void edifyApi.windowClose()} title="Close Edify">
          <X size={17} />
        </button>
      </div>
      <section className="home-utility-bar">
        <div className="home-utility-left">
          <button className="home-utility-pill" onClick={onOpenAccount}>
            <UserRound size={15} />
            <span>{accountUser ? accountUser.email : 'Account'}</span>
            <small>{accountUser ? accountUser.provider : 'Sign in / create'}</small>
          </button>
          <button className="home-utility-pill" onClick={onOpenPremium}>
            <Crown size={15} />
            <span>{hasPremium ? 'VIP active' : 'Premium'}</span>
            <small>{hasPremium ? 'Unlocked on this device' : 'Plans, rewards, trials'}</small>
          </button>
        </div>
        <div className="home-utility-right">
          <button className="home-utility-pill subtle" onClick={() => onOpenPanel('moderation')}>
            <ShieldCheck size={15} />
            <span>Review Mode</span>
            <small>Client preview and safety</small>
          </button>
          <button className="home-utility-pill subtle" onClick={onOpenThumbnailStudio}>
            <ImagePlus size={15} />
            <span>Thumbnail Studio</span>
            <small>PNG covers and promo cards</small>
          </button>
          <button className="home-utility-pill subtle home-utility-pill-new" onClick={onOpenAudioEditor}>
            <AudioLines size={15} />
            <span>Audio Editor</span>
            <small>New mixing, voice cleanup, and export</small>
            <em>NEW</em>
          </button>
          <button className="home-utility-pill subtle" onClick={() => void edifyApi.openExternalUrl('https://discord.gg/edify')}>
            <BadgeHelp size={15} />
            <span>Join Discord</span>
            <small>Community and drops</small>
          </button>
          <button className="home-utility-pill subtle" onClick={() => void edifyApi.openExternalUrl('mailto:support@edify.app')}>
            <LifeBuoy size={15} />
            <span>Support</span>
            <small>support@edify.app</small>
          </button>
        </div>
      </section>
      <section className="home-hero">
        <div className="brand-mark large">E</div>
        <div>
          <h1>Edify</h1>
          <p>Creative editing suite 3.0 for video, captions, audio, thumbnails, templates, premium packs, and review-ready exports.</p>
        </div>
      </section>

      <section className="home-project-launcher" aria-label="Project launcher">
        <button className="home-launch-card home-launch-card-primary" type="button" onClick={() => onNewProject('Untitled Edit')}>
          <span className="home-launch-icon"><Video size={20} /></span>
          <span>
            <small>Video</small>
            <strong>Magic Edit Project</strong>
            <em>Timeline, captions, cuts, audio, render, and export</em>
          </span>
        </button>
        <button className="home-launch-card" type="button" onClick={onOpenThumbnailStudio}>
          <span className="home-launch-icon"><ImagePlus size={20} /></span>
          <span>
            <small>Thumbnail</small>
            <strong>New Thumbnail</strong>
            <em>PNG covers, text styles, and pack presets</em>
          </span>
        </button>
        <button className="home-launch-card home-launch-card-new" type="button" onClick={onOpenAudioEditor}>
          <span className="home-launch-icon"><AudioLines size={20} /></span>
          <span>
            <small>Audio</small>
            <strong>New Audio Project</strong>
            <em>Record, clean, mix, and export sound</em>
          </span>
          <b>NEW</b>
        </button>
        <button className="home-launch-card" type="button" onClick={onOpenAccount}>
          <span className="home-launch-icon"><UserRound size={20} /></span>
          <span>
            <small>Account</small>
            <strong>{accountUser ? 'Cloud Sync Ready' : 'Connect Account'}</strong>
            <em>{accountUser ? 'Packs, rewards, and profile attached' : 'Sync profile, premium, and rewards'}</em>
          </span>
        </button>
      </section>

      <section className="home-dashboard-strip">
        {dashboardCards.map((card) => {
          const Icon = card.icon;
          return (
            <button className="home-dashboard-card" key={card.title} onClick={() => onOpenPanel(card.panel)}>
              <Icon size={18} />
              <span>
                <strong>{card.title}</strong>
                <small>{card.detail}</small>
              </span>
            </button>
          );
        })}
        <button className="home-dashboard-card home-dashboard-card-new" onClick={onOpenAudioEditor}>
          <AudioLines size={18} />
          <span>
            <strong>Audio Studio Pro</strong>
            <small>Waveform, cleanup, record, mix, beat sync, and ducking</small>
          </span>
          <em>NEW</em>
        </button>
      </section>

      <section className="home-studio-strip">
        {launchHighlights.map((item) => {
          const Icon = item.icon;
          return (
            <button className="home-studio-card" key={item.title} onClick={() => onOpenPanel(item.panel)}>
              <Icon size={18} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
            </button>
          );
        })}
        <div className="home-studio-meter">
          <span>Startup kit</span>
          <strong>3.0 systems</strong>
          <small>Magic Edit, captions, audio, marketplace, cloud, review, color, motion</small>
        </div>
      </section>

      <section className="home-sync-strip">
        <article className="home-sync-card">
          <div>
            <strong>My Cloud Projects</strong>
            <small>{accountUser ? 'Connected account sync is active for light project saves.' : 'Sign in to sync light project versions and profile settings.'}</small>
          </div>
          <b>{cloudProjects.length}</b>
        </article>
        <article className="home-sync-card">
          <div>
            <strong>Local Projects</strong>
            <small>Local-first editing stays on this machine with autosave and recovery.</small>
          </div>
          <b>{localProjects.length}</b>
        </article>
        <article className="home-sync-card">
          <div>
            <strong>Client Review</strong>
            <small>Prepare watermark previews, notes, and safe-zone review before export.</small>
          </div>
          <button className="secondary-button" onClick={() => onOpenPanel('moderation')}>Open review</button>
        </article>
      </section>

      <section className="home-grid">
        <div className="home-actions">
          <button className="home-action primary" onClick={() => onNewProject('Untitled Edit')}>
            <Plus size={22} />
            <span>New Project</span>
          </button>
          <button className="home-action" onClick={onOpenProject}>
            <FolderOpen size={22} />
            <span>Open Project</span>
          </button>
          <button className="home-action" onClick={onImportMedia}>
            <Import size={22} />
            <span>Import Media</span>
          </button>
          <button className="home-action" onClick={onOpenThumbnailStudio}>
            <ImagePlus size={22} />
            <span>Thumbnail Studio</span>
          </button>
          <button className="home-action home-action-new" onClick={onOpenAudioEditor}>
            <AudioLines size={22} />
            <span>Audio Editor</span>
            <small>NEW</small>
          </button>
          <button className="home-action" onClick={onOpenEdifyStudio}>
            <LayoutTemplate size={22} />
            <span>Thumbnail Studio Pro</span>
          </button>
          <button className="home-action premium-home-action" onClick={onOpenPremium}>
            <Crown size={22} />
            <span>Premium Studio</span>
          </button>
        </div>

        <div className="drop-zone">
          <Video size={34} />
          <strong>Drop footage here</strong>
          <span>Videos, audio, images, and existing .edify project files stay local on this machine.</span>
        </div>

        <div className="home-panel recent-panel">
          <div className="panel-heading">
            <span>Project Library</span>
            <small>{bootstrap?.paths.projects ?? 'Edify Projects'}</small>
          </div>
          <div className="project-library-groups">
            <section className="project-library-group">
              <header>
                <strong>This device</strong>
                <small>{localProjects.length} project{localProjects.length === 1 ? '' : 's'}</small>
              </header>
              <div className="recent-list">
                {localProjects.length === 0 ? (
                  <div className="empty-state compact">
                    <Sparkles size={18} />
                    <span>Your recent local projects will appear here after the first save.</span>
                  </div>
                ) : (
                  localProjects.map((project) => (
                    <button
                      className="recent-item"
                      key={project.path}
                      onClick={() => onOpenRecent(project.path)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setRecentMenu({ x: event.clientX, y: event.clientY, project });
                      }}
                    >
                      <span className="recent-thumb" />
                      <span>
                        <strong>{project.name}</strong>
                        <small>{new Date(project.updatedAt).toLocaleString()}</small>
                        <em className="recent-location-badge local">This device</em>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
            <section className="project-library-group">
              <header>
                <strong>My Cloud Projects</strong>
                <small>{accountUser ? `${cloudProjects.length} synced` : 'Connect to sync'}</small>
              </header>
              <div className="recent-list">
                {cloudProjects.length === 0 ? (
                  <div className="empty-state compact">
                    <Sparkles size={18} />
                    <span>{accountUser ? 'Cloud-linked projects will appear here after the next save.' : 'Sign in to restore cloud-linked projects, plans, and rewards.'}</span>
                  </div>
                ) : (
                  cloudProjects.map((project) => (
                    <button
                      className="recent-item"
                      key={project.path}
                      onClick={() => onOpenRecent(project.path)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setRecentMenu({ x: event.clientX, y: event.clientY, project });
                      }}
                    >
                      <span className="recent-thumb" />
                      <span>
                        <strong>{project.name}</strong>
                        <small>{new Date(project.updatedAt).toLocaleString()}</small>
                        <em className="recent-location-badge cloud">Cloud account</em>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="home-panel template-panel">
          <div className="panel-heading">
            <span>Template Engine</span>
            <small>Full packs, systems, and launch-ready structures</small>
          </div>
          <div className="template-list">
            {templates.map((template, index) => (
              <button
                className="template-card"
                key={template}
                onClick={() => onNewProject(template)}
              >
                <LayoutTemplate size={18} />
                <span>{template}</span>
                <small>{index === 0 ? '16:9, 30fps' : index === 1 ? '9:16, beat cuts' : index === 4 ? 'Chill music + warm grade' : 'Creator preset'}</small>
              </button>
            ))}
            <button className="template-card template-engine-card" onClick={() => onOpenPanel('templates')}>
              <LayoutTemplate size={18} />
              <span>Open full template engine</span>
              <small>Gaming, cinematic, luxury, shorts, tutorial, and product systems.</small>
            </button>
            <button className="template-card template-engine-card" onClick={() => onOpenPanel('marketplace')}>
              <ShoppingBag size={18} />
              <span>Browse pack marketplace</span>
              <small>Bundles, limited offers, premium templates, sounds, captions, and plugins.</small>
            </button>
          </div>
        </div>
      </section>
      {recentMenu && (
        <div className="context-menu home-context-menu" style={{ left: recentMenu.x, top: recentMenu.y }}>
          <button
            onClick={() => {
              onRenameRecent(recentMenu.project);
              setRecentMenu(null);
            }}
          >
            Rename project
          </button>
          <button
            onClick={() => {
              onDeleteRecent(recentMenu.project);
              setRecentMenu(null);
            }}
          >
            Delete project
          </button>
        </div>
      )}
    </main>
  );
});
