import { Cloud, Download, FolderOpen, HardDrive, Headphones, Monitor, RotateCcw, ShieldAlert, SlidersHorizontal, UserRound, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { edifyApi } from '../../lib/bridge';
import type { AppSettings, BootstrapInfo, Toast } from '../../types/edify';

type SettingsModalProps = {
  settings: AppSettings;
  onClose: () => void;
  onSettingsChange: (settings: AppSettings) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
};

export function SettingsModal({ settings, onClose, onSettingsChange, pushToast }: SettingsModalProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [bootstrap, setBootstrap] = useState<BootstrapInfo | null>(null);
  const [exportFormat, setExportFormat] = useState('MP4 - H.264');
  const [audioDevice, setAudioDevice] = useState('System default');

  useEffect(() => {
    void edifyApi.bootstrap().then(setBootstrap).catch(() => undefined);
  }, []);

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    const saved = await edifyApi.setSetting(key, value);
    onSettingsChange((saved as AppSettings) ?? next);
    pushToast({ title: 'Settings updated', detail: `${key} saved`, tone: 'success' });
  };

  const copyDiagnostics = async () => {
    const diagnostics = [
      `Edify ${bootstrap?.appVersion ?? 'unknown'}`,
      `Platform: ${bootstrap?.platform ?? navigator.platform}`,
      `Projects: ${bootstrap?.paths.projects ?? 'unknown'}`,
      `Cache: ${bootstrap?.paths.cache ?? 'unknown'}`,
      `Preview quality: ${draft.previewQuality}`,
      `UI scale: ${Math.round(draft.uiScale * 100)}%`,
      `Hardware acceleration: ${draft.hardwareAcceleration ? 'on' : 'off'}`
    ].join('\n');
    await navigator.clipboard.writeText(diagnostics);
    pushToast({ title: 'Diagnostics copied', detail: 'You can paste this into a support message.', tone: 'success' });
  };

  const checkForUpdates = async () => {
    const result = await edifyApi.checkForUpdates();
    if (result.ok) {
      pushToast({
        title: result.status === 'not-packaged' ? 'Installed app required' : 'Update check started',
        detail: result.detail ?? (result.version ? `Latest release detected: ${result.version}` : 'Edify is checking GitHub releases now.'),
        tone: result.status === 'not-packaged' ? 'warning' : 'info'
      });
      return;
    }
    pushToast({ title: 'Update check failed', detail: result.detail ?? 'GitHub release lookup failed.', tone: 'danger' });
  };

  return (
    <div className="modal-scrim">
      <section className="modal settings-modal">
        <header className="modal-header">
          <div>
            <span className="modal-eyebrow">Settings Center</span>
            <h2>Edify control center</h2>
            <p>Updates, account, cache, performance, audio devices, export defaults, and diagnostics.</p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>
        <div className="settings-center-scroll">
          <div className="settings-center-grid">
            <section className="settings-center-card settings-center-card-wide">
              <header><Download size={18} /><div><strong>Updates</strong><small>Required desktop updates install automatically when available.</small></div></header>
              <div className="settings-row">
                <span>Current version</span>
                <b>{bootstrap?.appVersion ?? 'Loading...'}</b>
              </div>
              <button className="secondary-button" type="button" onClick={() => void checkForUpdates()}>Check for updates</button>
            </section>

            <section className="settings-center-card">
              <header><UserRound size={18} /><div><strong>Account</strong><small>Cloud profile, premium ownership, and reward history.</small></div></header>
              <button className="secondary-button" type="button" onClick={() => pushToast({ title: 'Account center', detail: 'Open Account from the dashboard to connect Google, GitHub, or Microsoft.', tone: 'info' })}>Open account hint</button>
            </section>

            <section className="settings-center-card">
              <header><HardDrive size={18} /><div><strong>Storage and cache</strong><small>Project cache, autosave, and local app data.</small></div></header>
              <div className="settings-path-list">
                <span>Cache <b>{bootstrap?.paths.cache ?? 'Loading...'}</b></span>
                <span>Autosave <b>{bootstrap?.paths.autosave ?? 'Loading...'}</b></span>
              </div>
              <button className="secondary-button" type="button" onClick={() => bootstrap?.paths.cache && void edifyApi.showItemInFolder(bootstrap.paths.cache)}><FolderOpen size={15} /> Open cache folder</button>
            </section>

            <section className="settings-center-card">
              <header><Monitor size={18} /><div><strong>Performance</strong><small>Keep editing smooth on this machine.</small></div></header>
              <label>Preview quality<select value={draft.previewQuality} onChange={(event) => void update('previewQuality', event.target.value as AppSettings['previewQuality'])}><option>Full</option><option>Half</option><option>Quarter</option></select></label>
              <label>UI scale<input type="range" min="0.85" max="1.25" step="0.05" value={draft.uiScale} onChange={(event) => void update('uiScale', Number(event.target.value))} /><span>{Math.round(draft.uiScale * 100)}%</span></label>
              <label className="settings-inline-toggle"><Zap size={16} /> Hardware acceleration<input type="checkbox" checked={draft.hardwareAcceleration} onChange={(event) => void update('hardwareAcceleration', event.target.checked)} /></label>
            </section>

            <section className="settings-center-card">
              <header><Headphones size={18} /><div><strong>Audio device</strong><small>Default device used by Audio Editor previews and recording.</small></div></header>
              <select value={audioDevice} onChange={(event) => { setAudioDevice(event.target.value); pushToast({ title: 'Audio device saved', detail: event.target.value, tone: 'success' }); }}>
                <option>System default</option>
                <option>Built-in microphone</option>
                <option>External USB microphone</option>
                <option>Virtual audio cable</option>
              </select>
            </section>

            <section className="settings-center-card">
              <header><SlidersHorizontal size={18} /><div><strong>Export defaults</strong><small>Starter preset for new exports.</small></div></header>
              <select value={exportFormat} onChange={(event) => { setExportFormat(event.target.value); pushToast({ title: 'Export default saved', detail: event.target.value, tone: 'success' }); }}>
                <option>MP4 - H.264</option>
                <option>PNG thumbnail</option>
                <option>WAV audio master</option>
                <option>WEBP web image</option>
              </select>
              <label>Autosave interval<select value={draft.autosaveMinutes} onChange={(event) => void update('autosaveMinutes', Number(event.target.value))}><option value={1}>Every minute</option><option value={2}>Every 2 minutes</option><option value={5}>Every 5 minutes</option><option value={10}>Every 10 minutes</option></select></label>
            </section>

            <section className="settings-center-card">
              <header><Cloud size={18} /><div><strong>Cloud sync</strong><small>Local-first projects with optional account continuity.</small></div></header>
              <div className="settings-row"><span>Status</span><b>Ready</b></div>
              <button className="secondary-button" type="button" onClick={() => pushToast({ title: 'Sync now', detail: 'Cloud sync will run when an account session is available.', tone: 'info' })}>Sync now</button>
            </section>

            <section className="settings-center-card settings-center-card-danger">
              <header><ShieldAlert size={18} /><div><strong>Crash and logs</strong><small>Copy diagnostics and open folders for support.</small></div></header>
              <div className="settings-inline-actions">
                <button className="secondary-button" type="button" onClick={() => void copyDiagnostics()}>Copy diagnostics</button>
                <button className="secondary-button" type="button" onClick={() => bootstrap?.paths.userData && void edifyApi.showItemInFolder(bootstrap.paths.userData)}>Open app data</button>
              </div>
              <button className="danger-button" type="button" onClick={() => pushToast({ title: 'Reset protected', detail: 'Manual reset is disabled here to avoid deleting projects by mistake.', tone: 'warning' })}><RotateCcw size={15} /> Reset app data</button>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
