import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ffmpegStaticPath from 'ffmpeg-static';

type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  updatedAt: string;
  thumbnail?: string;
  source?: 'local' | 'cloud';
};

type MediaKind = 'video' | 'audio' | 'image' | 'unknown';

type ImportResult = {
  id: string;
  name: string;
  kind: MediaKind;
  path: string;
  previewUrl: string;
  size: number;
  extension: string;
  importedAt: string;
  duration?: number;
  dimensions?: {
    width: number;
    height: number;
  };
};

type AppSettings = {
  uiScale: number;
  previewQuality: 'Full' | 'Half' | 'Quarter';
  hardwareAcceleration: boolean;
  autosaveMinutes: number;
};

type DesktopAccountProvider = 'google' | 'github' | 'microsoft';

type DesktopAccountUser = {
  id: string;
  name: string;
  email: string;
  provider: DesktopAccountProvider;
};

type DesktopAuthSession = {
  provider: DesktopAccountProvider;
  cookie: string;
  user: DesktopAccountUser;
  updatedAt: string;
};

type CloudProjectEntry = {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
  document: string;
};

type AppwriteAccountRecord = {
  $id: string;
  name?: string;
  email?: string;
  prefs?: Record<string, unknown> & {
    edifyCloudProjects?: {
      version: 1;
      projects: CloudProjectEntry[];
      updatedAt: string;
    };
  };
};

type StoreShape = {
  recentProjects: ProjectSummary[];
  studioRecentProjects: ProjectSummary[];
  audioRecentProjects: ProjectSummary[];
  settings: AppSettings;
  authSession: DesktopAuthSession | null;
  consentAcceptedAt: string | null;
  consentMode: 'all' | 'essential' | null;
  consentInstallId: string | null;
};

const defaultStore: StoreShape = {
  recentProjects: [],
  studioRecentProjects: [],
  audioRecentProjects: [],
  settings: {
    uiScale: 1,
    previewQuality: 'Half',
    hardwareAcceleration: true,
    autosaveMinutes: 2
  },
  authSession: null,
  consentAcceptedAt: null,
  consentMode: null,
  consentInstallId: null
};

let storeData: StoreShape = structuredClone(defaultStore);
let storeLoaded = false;

let mainWindow: BrowserWindow | null = null;
let thumbnailAdvancedWindow: BrowserWindow | null = null;
let thumbnailAdvancedProject: any | null = null;
let edifyStudioWindow: BrowserWindow | null = null;
let edifyStudioSeedProject: any | null = null;
let audioEditorWindow: BrowserWindow | null = null;
const exportJobs = new Map<string, { cancel: () => void }>();
let allowWindowClose = false;
let updatePromptVisible = false;
let rendererWindowState: {
  screen: 'home' | 'editor';
  saveStatus: string;
  project: any | null;
} = {
  screen: 'home',
  saveStatus: 'saved',
  project: null
};

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

const mediaExtensions: Record<string, MediaKind> = {
  '.mp4': 'video',
  '.mov': 'video',
  '.mkv': 'video',
  '.webm': 'video',
  '.avi': 'video',
  '.m4v': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.aac': 'audio',
  '.flac': 'audio',
  '.ogg': 'audio',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image'
};

const appwriteEndpoint = 'https://nyc.cloud.appwrite.io/v1';
const appwriteProjectId = '69eb236d0037072f2c92';
const cloudProjectPrefsKey = 'edifyCloudProjects';
const cloudProjectPrefsLimit = 58_000;

function getProjectsDir() {
  return path.join(app.getPath('documents'), 'Edify Projects');
}

function getStudioProjectsDir() {
  return path.join(app.getPath('documents'), 'Thumbnail Studio Projects');
}

function getAudioProjectsDir() {
  return path.join(app.getPath('documents'), 'Audio Editor Projects');
}

function getCacheDir() {
  return path.join(app.getPath('userData'), 'Cache');
}

function getAutosavePath() {
  return path.join(app.getPath('userData'), 'recovery.edify.autosave');
}

function getWindowIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'icon.ico');
  }
  return path.join(__dirname, '../resources/icon.ico');
}

function getStorePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function loadStore() {
  if (storeLoaded) return;
  try {
    const raw = await fs.readFile(getStorePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    storeData = {
      recentProjects: parsed.recentProjects ?? defaultStore.recentProjects,
      studioRecentProjects: parsed.studioRecentProjects ?? defaultStore.studioRecentProjects,
      audioRecentProjects: parsed.audioRecentProjects ?? defaultStore.audioRecentProjects,
      settings: {
        ...defaultStore.settings,
        ...(parsed.settings ?? {})
      },
      authSession: parsed.authSession ?? defaultStore.authSession,
      consentAcceptedAt: parsed.consentAcceptedAt ?? defaultStore.consentAcceptedAt,
      consentMode: parsed.consentMode ?? defaultStore.consentMode,
      consentInstallId: parsed.consentInstallId ?? defaultStore.consentInstallId
    };
  } catch {
    storeData = structuredClone(defaultStore);
  }
  storeLoaded = true;
}

async function persistStore() {
  await fs.writeFile(getStorePath(), JSON.stringify(storeData, null, 2), 'utf8');
}

async function getCurrentInstallId() {
  try {
    const exePath = app.getPath('exe');
    const stat = await fs.stat(exePath);
    return `${exePath}|${Math.round(stat.ctimeMs)}|${stat.size}`;
  } catch {
    return `${app.getVersion()}|fallback-install-id`;
  }
}

function appwriteHeaders(cookie?: string, json = false) {
  const headers: Record<string, string> = {
    'X-Appwrite-Project': appwriteProjectId
  };
  if (json) headers['content-type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function isCloudProjectPath(filePath?: string) {
  return Boolean(filePath?.startsWith('cloud://'));
}

function cloudPathForProject(projectId: string) {
  return `cloud://${projectId}`;
}

function appwriteRequest(pathname: string, options?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  const normalizedPath = pathname.replace(/^\/+/, '');
  const target = new URL(normalizedPath, `${appwriteEndpoint}/`);
  return new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const request = https.request(target, {
      method: options?.method ?? 'GET',
      headers: options?.headers
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    request.on('error', reject);

    if (options?.body) {
      request.write(options.body);
    }

    request.end();
  });
}

function extractSessionCookie(headers: http.IncomingHttpHeaders) {
  const rawCookies = headers['set-cookie'];
  const setCookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  return setCookies.find((part) => part.startsWith(`a_session_${appwriteProjectId}=`))?.split(';')[0] ?? '';
}

async function fetchDesktopAccount(cookie: string) {
  const response = await appwriteRequest('/account', {
    method: 'GET',
    headers: appwriteHeaders(cookie)
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Appwrite account request failed (${response.statusCode})`);
  }
  const user = JSON.parse(response.body) as { $id: string; name?: string; email?: string };
  return {
    id: user.$id,
    name: user.name || user.email || 'Edify user',
    email: user.email || ''
  };
}

async function fetchAccountRecord(cookie: string) {
  const response = await appwriteRequest('/account', {
    method: 'GET',
    headers: appwriteHeaders(cookie)
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Appwrite account request failed (${response.statusCode})`);
  }
  return JSON.parse(response.body) as AppwriteAccountRecord;
}

function sanitizeProjectForCloud(document: any) {
  return {
    ...document,
    path: cloudPathForProject(document.id ?? randomUUID()),
    assets: Array.isArray(document.assets)
      ? document.assets.map((asset: any) => ({
          id: asset.id,
          name: asset.name,
          kind: asset.kind,
          path: asset.path,
          size: asset.size,
          extension: asset.extension,
          duration: asset.duration,
          importedAt: asset.importedAt,
          dimensions: asset.dimensions,
          category: asset.category,
          favorite: asset.favorite,
          missing: asset.missing
        }))
      : [],
    tracks: Array.isArray(document.tracks)
      ? document.tracks.map((track: any) => ({
          ...track,
          clips: Array.isArray(track.clips)
            ? track.clips.map((clip: any) => ({
                ...clip,
                selected: false
              }))
            : []
        }))
      : []
  };
}

function summarizeCloudProject(entry: CloudProjectEntry): ProjectSummary {
  return {
    id: entry.id,
    name: entry.name,
    path: cloudPathForProject(entry.id),
    updatedAt: entry.updatedAt,
    thumbnail: entry.thumbnail,
    source: 'cloud'
  };
}

function mergeRecentProjects(localProjects: ProjectSummary[], cloudProjects: ProjectSummary[]) {
  const merged = new Map<string, ProjectSummary>();
  [...localProjects, ...cloudProjects].forEach((project) => {
    const key = project.id || project.path;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, project);
      return;
    }
    if (existing.source === 'cloud' && project.source === 'local') {
      merged.set(key, project);
      return;
    }
    if (new Date(project.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      merged.set(key, project);
    }
  });
  return Array.from(merged.values())
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 12);
}

function trimCloudProjects(entries: CloudProjectEntry[]) {
  const ordered = [...entries].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  while (ordered.length > 0) {
    const payload = JSON.stringify({
      version: 1,
      projects: ordered,
      updatedAt: new Date().toISOString()
    });
    if (payload.length <= cloudProjectPrefsLimit) {
      return {
        version: 1 as const,
        projects: ordered,
        updatedAt: new Date().toISOString()
      };
    }
    ordered.pop();
  }
  return {
    version: 1 as const,
    projects: [],
    updatedAt: new Date().toISOString()
  };
}

async function fetchCloudProjects(cookie: string) {
  const account = await fetchAccountRecord(cookie);
  const cloudData = account.prefs?.[cloudProjectPrefsKey] as { version?: number; projects?: CloudProjectEntry[] } | undefined;
  const projects = Array.isArray(cloudData?.projects) ? cloudData.projects : [];
  return projects.map(summarizeCloudProject);
}

async function updateCloudProjects(cookie: string, updater: (projects: CloudProjectEntry[]) => CloudProjectEntry[]) {
  const account = await fetchAccountRecord(cookie);
  const prefs = { ...(account.prefs ?? {}) };
  const currentProjects = Array.isArray((prefs[cloudProjectPrefsKey] as any)?.projects)
    ? ((prefs[cloudProjectPrefsKey] as any).projects as CloudProjectEntry[])
    : [];
  prefs[cloudProjectPrefsKey] = trimCloudProjects(updater(currentProjects));
  const response = await appwriteRequest('/account/prefs', {
    method: 'PATCH',
    headers: appwriteHeaders(cookie, true),
    body: JSON.stringify({ prefs })
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(response.body || `Appwrite prefs update failed (${response.statusCode})`);
  }
  return JSON.parse(response.body) as AppwriteAccountRecord;
}

async function syncProjectToCloud(document: any) {
  const session = storeData.authSession;
  if (!session?.cookie) return false;
  const sanitized = sanitizeProjectForCloud(document);
  const entry: CloudProjectEntry = {
    id: sanitized.id ?? randomUUID(),
    name: sanitized.name ?? 'Untitled Edit',
    updatedAt: sanitized.updatedAt ?? new Date().toISOString(),
    thumbnail: sanitized.thumbnail,
    document: JSON.stringify(sanitized)
  };
  await updateCloudProjects(session.cookie, (projects) => {
    const next = projects.filter((project) => project.id !== entry.id);
    next.unshift(entry);
    return next;
  });
  return true;
}

async function openCloudProject(filePath: string) {
  const session = storeData.authSession;
  if (!session?.cookie) {
    throw new Error('Sign in to access your cloud projects.');
  }
  const projectId = filePath.replace(/^cloud:\/\//, '');
  const account = await fetchAccountRecord(session.cookie);
  const cloudData = account.prefs?.[cloudProjectPrefsKey] as { projects?: CloudProjectEntry[] } | undefined;
  const project = Array.isArray(cloudData?.projects) ? cloudData.projects.find((item) => item.id === projectId) : undefined;
  if (!project) {
    throw new Error('This cloud project could not be found in your Edify account.');
  }
  const document = JSON.parse(project.document);
  document.path = cloudPathForProject(project.id);
  return {
    filePath: cloudPathForProject(project.id),
    document
  };
}

async function renameCloudProject(filePath: string, name: string) {
  const session = storeData.authSession;
  if (!session?.cookie) {
    throw new Error('Sign in to update this cloud project.');
  }
  const projectId = filePath.replace(/^cloud:\/\//, '');
  let nextDocument: any = null;
  await updateCloudProjects(session.cookie, (projects) => projects.map((project) => {
    if (project.id !== projectId) return project;
    const document = JSON.parse(project.document);
    nextDocument = {
      ...document,
      name,
      updatedAt: new Date().toISOString(),
      path: cloudPathForProject(projectId)
    };
    return {
      ...project,
      name,
      updatedAt: nextDocument.updatedAt,
      document: JSON.stringify(nextDocument)
    };
  }));
  return nextDocument;
}

async function deleteCloudProject(filePath: string) {
  const session = storeData.authSession;
  if (!session?.cookie) {
    throw new Error('Sign in to delete this cloud project.');
  }
  const projectId = filePath.replace(/^cloud:\/\//, '');
  await updateCloudProjects(session.cookie, (projects) => projects.filter((project) => project.id !== projectId));
}

async function getRecentProjectsForBootstrap() {
  const localProjects = storeData.recentProjects.map((project) => ({
    ...project,
    source: project.source ?? 'local'
  }));
  const session = storeData.authSession;
  if (!session?.cookie) {
    return localProjects;
  }
  try {
    const cloudProjects = await fetchCloudProjects(session.cookie);
    return mergeRecentProjects(localProjects, cloudProjects);
  } catch {
    return localProjects;
  }
}

async function clearStoredDesktopAuth() {
  storeData.authSession = null;
  await persistStore();
}

async function getStoredDesktopAccount() {
  const session = storeData.authSession;
  if (!session?.cookie) return null;
  try {
    const user = await fetchDesktopAccount(session.cookie);
    const nextSession: DesktopAuthSession = {
      ...session,
      user: {
        ...user,
        provider: session.provider
      },
      updatedAt: new Date().toISOString()
    };
    storeData.authSession = nextSession;
    await persistStore();
    return nextSession.user;
  } catch {
    await clearStoredDesktopAuth();
    return null;
  }
}

async function startDesktopOAuth(provider: DesktopAccountProvider) {
  return new Promise<DesktopAccountUser>(async (resolve, reject) => {
    let settled = false;
    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/auth/callback') {
        response.writeHead(404).end('Not found');
        return;
      }

      const userId = url.searchParams.get('userId') ?? '';
      const secret = url.searchParams.get('secret') ?? '';
      const error = url.searchParams.get('error') ?? url.searchParams.get('message') ?? '';

      const reply = (state: 'success' | 'error' | 'info', title: string, detail: string, meta?: { provider?: string; email?: string }) => {
        const accent = state === 'success' ? '#2ad4a7' : state === 'error' ? '#ffd166' : '#42e8ff';
        const eyebrow = state === 'success' ? 'ACCOUNT CONNECTED' : state === 'error' ? 'SIGN-IN FAILED' : 'ACCOUNT STATUS';
        const providerLabel = meta?.provider ? `${meta.provider[0].toUpperCase()}${meta.provider.slice(1)}` : 'Provider';
        const statusLine = state === 'success'
          ? `${providerLabel} is now linked to this Edify desktop session.`
          : 'The desktop account session was not completed.';
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;background:radial-gradient(circle at top left,rgba(66,232,255,.12),transparent 28%),radial-gradient(circle at top right,rgba(143,107,255,.16),transparent 34%),#05060a;color:#eef4ff;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}main{width:min(760px,calc(100vw - 40px));padding:32px;border:1px solid rgba(154,177,255,.16);border-radius:28px;background:linear-gradient(180deg,rgba(12,15,24,.96),rgba(8,10,18,.98));box-shadow:0 28px 90px rgba(0,0,0,.42)}.brand{display:inline-flex;align-items:center;justify-content:center;width:54px;height:54px;border-radius:16px;background:linear-gradient(135deg,#2e83ff,#8f6bff);font-weight:900;margin-bottom:18px;font-size:28px}.eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.18em;color:${accent};margin-bottom:14px}.hero{display:grid;gap:14px}.hero h1{margin:0;font-size:42px;line-height:1.05}.hero p{margin:0;color:#aeb9ce;line-height:1.75}.status{margin-top:18px;padding:16px 18px;border-radius:18px;border:1px solid rgba(154,177,255,.16);background:rgba(18,24,38,.88)}.status strong{display:block;margin-bottom:6px}.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(154,177,255,.14);font-size:13px;color:#dce8ff;margin-top:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:22px}.card{padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(154,177,255,.12)}.card strong{display:block;margin-bottom:8px;font-size:15px}.card span{display:block;color:#aeb9ce;line-height:1.65;font-size:14px}.footer{margin-top:24px;display:flex;flex-wrap:wrap;gap:12px}.button{display:inline-flex;align-items:center;justify-content:center;padding:12px 16px;border-radius:14px;border:1px solid rgba(154,177,255,.18);background:linear-gradient(135deg,#2e83ff,#8f6bff);color:#fff;text-decoration:none;font-weight:700}.ghost{background:rgba(255,255,255,.03);color:#eef4ff}.meta{color:#7f8aa3;font-size:13px;margin-top:14px}</style></head><body><main><div class="brand">E</div><div class="hero"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${detail}</p></div><div class="status"><strong>${statusLine}</strong><span>${meta?.email ? `Connected account: ${meta.email}` : state === 'error' ? 'Return to Edify, reopen Account, and try again once the provider settings are fixed.' : 'You can return to the app now.'}</span></div><div class="pill">${providerLabel}</div><div class="grid"><div class="card"><strong>Profile and sync</strong><span>Keep your name, provider, favorites, settings, workspace layout, and export presets on one Edify profile.</span></div><div class="card"><strong>Premium and rewards</strong><span>Attach Creator Pro, Gaming Pro, Cinematic Pro, Studio Max, promo codes, daily unlocks, and sponsored rewards to your account.</span></div><div class="card"><strong>Marketplace and future cloud</strong><span>Link purchased packs, saved templates, sounds, captions, review links, light project sync, and your future brand kit.</span></div></div><div class="footer"><a class="button" href="#" onclick="window.close();return false;">Return to Edify</a><a class="button ghost" href="#" onclick="window.location.reload();return false;">${state === 'error' ? 'Try again' : 'Close tab'}</a></div><div class="meta">This device now uses your Edify account for desktop sync, premium access, and future cross-device features.</div></main></body></html>`);
      };

      if (!userId || !secret) {
        reply('error', 'Sign-in not completed', error || 'Edify did not receive the OAuth callback token. You can return to the app and try again.', { provider });
        if (!settled) {
          settled = true;
          server.close();
          reject(new Error(error || 'Missing Appwrite OAuth callback token.'));
        }
        return;
      }

      try {
        const sessionResponse = await appwriteRequest('/account/sessions/token', {
          method: 'POST',
          headers: appwriteHeaders(undefined, true),
          body: JSON.stringify({ userId, secret })
        });
        if (sessionResponse.statusCode < 200 || sessionResponse.statusCode >= 300) {
          throw new Error(sessionResponse.body || `Appwrite session exchange failed (${sessionResponse.statusCode})`);
        }

        const cookie = extractSessionCookie(sessionResponse.headers);
        if (!cookie) {
          throw new Error('Edify could not persist the Appwrite session cookie.');
        }

        const user = await fetchDesktopAccount(cookie);
        const authUser: DesktopAccountUser = { ...user, provider };
        storeData.authSession = {
          provider,
          cookie,
          user: authUser,
          updatedAt: new Date().toISOString()
        };
        await persistStore();
        reply('success', 'Edify account connected', 'Your desktop account session is now active and ready for sync, premium plans, rewards, and future cloud features.', { provider, email: authUser.email });
        if (!settled) {
          settled = true;
          server.close();
          resolve(authUser);
        }
      } catch (error) {
        reply('error', 'Sign-in failed', error instanceof Error ? error.message : 'The desktop session could not be created.', { provider });
        if (!settled) {
          settled = true;
          server.close();
          reject(error instanceof Error ? error : new Error('The desktop session could not be created.'));
        }
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        if (!settled) {
          settled = true;
          server.close();
          reject(new Error('Edify could not open the local auth callback server.'));
        }
        return;
      }

      const callbackUrl = `http://localhost:${address.port}/auth/callback`;
      const oauthUrl = new URL(`${appwriteEndpoint}/account/tokens/oauth2/${provider}`);
      oauthUrl.searchParams.set('project', appwriteProjectId);
      oauthUrl.searchParams.set('success', callbackUrl);
      oauthUrl.searchParams.set('failure', callbackUrl);

      try {
        await shell.openExternal(oauthUrl.toString());
      } catch (error) {
        if (!settled) {
          settled = true;
          server.close();
          reject(error instanceof Error ? error : new Error('Edify could not open the browser for sign-in.'));
        }
      }
    });

    setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(new Error('The sign-in request timed out. Please try again.'));
    }, 180000);
  });
}

async function signOutDesktopAccount() {
  const session = storeData.authSession;
  if (!session?.cookie) {
    await clearStoredDesktopAuth();
    return { ok: true };
  }

  try {
    await appwriteRequest('/account/sessions/current', {
      method: 'DELETE',
      headers: appwriteHeaders(session.cookie)
    });
  } catch {
    // ignore remote sign-out failures and still clear the local session
  }

  await clearStoredDesktopAuth();
  return { ok: true };
}

async function ensureAppDirs() {
  await fs.mkdir(getProjectsDir(), { recursive: true });
  await fs.mkdir(getStudioProjectsDir(), { recursive: true });
  await fs.mkdir(getAudioProjectsDir(), { recursive: true });
  await fs.mkdir(getCacheDir(), { recursive: true });
  await fs.mkdir(path.join(app.getPath('userData'), 'Recordings'), { recursive: true });
  await loadStore();
}

async function addRecentProject(summary: ProjectSummary) {
  const current = storeData.recentProjects;
  const next = [
    summary,
    ...current.filter((item) => item.path !== summary.path)
  ].slice(0, 12);
  storeData.recentProjects = next;
  await persistStore();
}

async function addRecentStudioProject(summary: ProjectSummary) {
  const current = storeData.studioRecentProjects;
  const next = [
    summary,
    ...current.filter((item) => item.path !== summary.path)
  ].slice(0, 24);
  storeData.studioRecentProjects = next;
  await persistStore();
}

async function addRecentAudioProject(summary: ProjectSummary) {
  const current = storeData.audioRecentProjects;
  const next = [
    summary,
    ...current.filter((item) => item.path !== summary.path)
  ].slice(0, 24);
  storeData.audioRecentProjects = next;
  await persistStore();
}

function projectSaveDefaultPath(document: any) {
  const safeName = String(document?.name ?? 'Untitled Edit').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Untitled Edit';
  return path.join(getProjectsDir(), `${safeName}.edify`);
}

function studioProjectSaveDefaultPath(document: any) {
  const safeName = String(document?.name ?? 'Untitled Studio').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Untitled Studio';
  return path.join(getStudioProjectsDir(), `${safeName}.edifystudio`);
}

function audioProjectSaveDefaultPath(document: any) {
  const safeName = String(document?.name ?? 'Untitled Audio Project').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Untitled Audio Project';
  return path.join(getAudioProjectsDir(), `${safeName}.edifyaudio`);
}

async function saveProjectDocument(document: any, filePath?: string, forceDialog = false) {
  const targetPath =
    !forceDialog && filePath && !isCloudProjectPath(filePath)
      ? filePath
      : dialog.showSaveDialogSync(mainWindow!, {
          title: forceDialog ? 'Save Edify Project As' : 'Save Edify Project',
          defaultPath: projectSaveDefaultPath(document),
          filters: [{ name: 'Edify Project', extensions: ['edify'] }]
        });

  if (!targetPath) {
    return { canceled: true };
  }

  const nextDocument = {
    ...document,
    path: targetPath,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(targetPath, nextDocument);
  await addRecentProject(projectSummaryFromDocument(targetPath, nextDocument));
  const cloudSynced = await syncProjectToCloud(nextDocument).catch(() => false);
  return { canceled: false, filePath: targetPath, document: nextDocument, cloudSynced };
}

async function saveStudioProjectDocument(document: any, filePath?: string, forceDialog = false) {
  const targetPath =
    !forceDialog && filePath
      ? filePath
      : dialog.showSaveDialogSync(edifyStudioWindow ?? mainWindow!, {
          title: forceDialog ? 'Save Thumbnail Studio Project As' : 'Save Thumbnail Studio Project',
          defaultPath: studioProjectSaveDefaultPath(document),
          filters: [
            { name: 'Thumbnail Studio Project', extensions: ['edifystudio'] },
            { name: 'JSON', extensions: ['json'] }
          ]
        });

  if (!targetPath) {
    return { canceled: true };
  }

  const nextDocument = {
    ...document,
    kind: 'studio',
    path: targetPath,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(targetPath, nextDocument);
  await addRecentStudioProject(projectSummaryFromDocument(targetPath, nextDocument));
  return { canceled: false, filePath: targetPath, document: nextDocument };
}

async function saveAudioProjectDocument(document: any, filePath?: string, forceDialog = false) {
  const targetPath =
    !forceDialog && filePath
      ? filePath
      : dialog.showSaveDialogSync(audioEditorWindow ?? mainWindow!, {
          title: forceDialog ? 'Save Audio Editor Project As' : 'Save Audio Editor Project',
          defaultPath: audioProjectSaveDefaultPath(document),
          filters: [
            { name: 'Audio Editor Project', extensions: ['edifyaudio'] },
            { name: 'JSON', extensions: ['json'] }
          ]
        });

  if (!targetPath) {
    return { canceled: true };
  }

  const nextDocument = {
    ...document,
    kind: 'audio-editor',
    path: targetPath,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(targetPath, nextDocument);
  await addRecentAudioProject(projectSummaryFromDocument(targetPath, nextDocument));
  return { canceled: false, filePath: targetPath, document: nextDocument };
}

function projectNeedsSavePrompt() {
  return rendererWindowState.screen === 'editor'
    && Boolean(rendererWindowState.project)
    && ['dirty', 'autosaved', 'offline'].includes(rendererWindowState.saveStatus);
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

async function writeJsonFile(filePath: string, payload: unknown) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function projectSummaryFromDocument(filePath: string, document: any): ProjectSummary {
  return {
    id: document.id ?? randomUUID(),
    name: document.name ?? path.basename(filePath, '.edify'),
    path: filePath,
    updatedAt: new Date().toISOString(),
    thumbnail: document.thumbnail,
    source: 'local'
  };
}

function inferMediaKind(filePath: string): MediaKind {
  const ext = path.extname(filePath).toLowerCase();
  return mediaExtensions[ext] ?? 'unknown';
}

async function toImportResult(filePath: string): Promise<ImportResult> {
  const stat = await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const kind = inferMediaKind(filePath);

  return {
    id: randomUUID(),
    name: path.basename(filePath),
    kind,
    path: filePath,
    previewUrl: pathToFileURL(filePath).toString(),
    size: stat.size,
    extension: ext.replace('.', '').toUpperCase(),
    importedAt: new Date().toISOString(),
    duration: kind === 'image' ? 5 : undefined,
    dimensions: kind === 'video' || kind === 'image' ? { width: 1920, height: 1080 } : undefined
  };
}

async function writeRecording(name: string, buffer: ArrayBuffer): Promise<ImportResult> {
  const safeName = name.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ').trim() || 'Voice recording';
  const filePath = path.join(app.getPath('userData'), 'Recordings', `${safeName}.webm`);
  await fs.writeFile(filePath, Buffer.from(buffer));
  return toImportResult(filePath);
}

async function createWindow() {
  await ensureAppDirs();

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: '#05060a',
    icon: getWindowIconPath(),
    show: false,
    title: 'Edify',
    frame: false,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  const mediaPermissions = new Set(['media', 'microphone', 'camera']);
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(mediaPermissions.has(String(permission)));
  });

  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return mediaPermissions.has(String(permission));
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (allowWindowClose) {
      return;
    }
    if (!projectNeedsSavePrompt()) {
      allowWindowClose = true;
      return;
    }
    event.preventDefault();
    const targetWindow = mainWindow;
    if (targetWindow && !targetWindow.webContents.isDestroyed()) {
      targetWindow.webContents.send('edify:requestClose');
      targetWindow.focus();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

async function openThumbnailAdvancedWindow() {
  if (thumbnailAdvancedWindow && !thumbnailAdvancedWindow.isDestroyed()) {
    thumbnailAdvancedWindow.focus();
    return thumbnailAdvancedWindow;
  }

  thumbnailAdvancedWindow = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1320,
    minHeight: 820,
    backgroundColor: '#111214',
    icon: getWindowIconPath(),
    title: 'Edify Thumbnail Pro',
    parent: mainWindow ?? undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  thumbnailAdvancedWindow.once('ready-to-show', () => {
    thumbnailAdvancedWindow?.show();
  });

  thumbnailAdvancedWindow.on('closed', () => {
    thumbnailAdvancedWindow = null;
  });

  const advancedQuery = '?window=thumbnail-advanced';
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await thumbnailAdvancedWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${advancedQuery}`);
  } else {
    await thumbnailAdvancedWindow.loadURL(`${pathToFileURL(path.join(__dirname, '../dist/index.html')).toString()}${advancedQuery}`);
  }

  return thumbnailAdvancedWindow;
}

async function openEdifyStudioWindow() {
  if (edifyStudioWindow && !edifyStudioWindow.isDestroyed()) {
    edifyStudioWindow.focus();
    return edifyStudioWindow;
  }

  edifyStudioWindow = new BrowserWindow({
    width: 1760,
    height: 1120,
    minWidth: 1360,
    minHeight: 860,
    backgroundColor: '#0b0d11',
    icon: getWindowIconPath(),
    title: 'Thumbnail Studio',
    parent: mainWindow ?? undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  edifyStudioWindow.once('ready-to-show', () => {
    edifyStudioWindow?.show();
  });

  edifyStudioWindow.on('closed', () => {
    edifyStudioWindow = null;
  });

  const studioQuery = '?window=studio-editor';
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await edifyStudioWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${studioQuery}`);
  } else {
    await edifyStudioWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'studio-editor' } });
  }

  return edifyStudioWindow;
}

async function openAudioEditorWindow() {
  if (audioEditorWindow && !audioEditorWindow.isDestroyed()) {
    audioEditorWindow.focus();
    return audioEditorWindow;
  }

  audioEditorWindow = new BrowserWindow({
    width: 1760,
    height: 1100,
    minWidth: 1340,
    minHeight: 840,
    backgroundColor: '#081019',
    icon: getWindowIconPath(),
    title: 'Audio Editor',
    parent: mainWindow ?? undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  audioEditorWindow.once('ready-to-show', () => {
    audioEditorWindow?.show();
  });

  audioEditorWindow.on('closed', () => {
    audioEditorWindow = null;
  });

  const query = '?window=audio-editor';
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await audioEditorWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`);
  } else {
    await audioEditorWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'audio-editor' } });
  }

  return audioEditorWindow;
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    ipcMain.handle('edify:checkForUpdates', async () => ({
      ok: true,
      status: 'not-packaged',
      detail: 'Auto updates only run from the installed packaged app.'
    }));
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let updateBusy = false;

  const sendUpdateStatus = (payload: Record<string, unknown>) => {
    mainWindow?.webContents.send('edify:exportProgress', {
      type: 'app-update',
      required: true,
      ...payload
    });
  };

  autoUpdater.on('update-available', (info) => {
    updateBusy = true;
    sendUpdateStatus({
      phase: 'available',
      version: info.version,
      percent: 4,
      detail: 'A required Edify update is available and will download automatically.'
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      phase: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({
      phase: 'downloaded',
      version: info.version,
      percent: 100,
      detail: 'Download complete. Edify is preparing a clean restart.'
    });
    setTimeout(() => {
      sendUpdateStatus({
        phase: 'installing',
        version: info.version,
        percent: 100,
        detail: 'Installing update now. Edify will restart automatically.'
      });
      setTimeout(() => {
        autoUpdater.quitAndInstall();
      }, 1200);
    }, 900);
  });

  autoUpdater.on('update-not-available', (info) => {
    updateBusy = false;
    sendUpdateStatus({
      phase: 'idle',
      version: info.version,
      percent: 0,
      detail: 'Edify is already up to date.'
    });
  });

  autoUpdater.on('error', (error) => {
    updateBusy = false;
    console.error('Edify auto update error:', error);
    sendUpdateStatus({
      phase: 'error',
      detail: error instanceof Error ? error.message : 'Unknown update error',
      percent: 0
    });
  });

  ipcMain.handle('edify:checkForUpdates', async () => {
    if (updateBusy) {
      return { ok: true, status: 'busy', detail: 'An update check or download is already running.' };
    }
    try {
      updateBusy = true;
      sendUpdateStatus({
        phase: 'checking',
        percent: 2,
        detail: 'Checking GitHub releases for the latest Edify build.'
      });
      const result = await autoUpdater.checkForUpdates();
      updateBusy = Boolean(result?.updateInfo?.version && result.updateInfo.version !== app.getVersion());
      return { ok: true, status: 'checking', version: result?.updateInfo?.version };
    } catch (error) {
      updateBusy = false;
      const detail = error instanceof Error ? error.message : 'Update check failed.';
      sendUpdateStatus({ phase: 'error', detail, percent: 0 });
      return { ok: false, status: 'error', detail };
    }
  });

  app.whenReady().then(() => {
    setTimeout(() => {
      void autoUpdater.checkForUpdates().catch((error) => {
        console.error('Edify update check failed:', error);
      });
    }, 3500);
  });
}

if (singleInstanceLock) {
  app.whenReady().then(createWindow);
  setupAutoUpdater();
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

ipcMain.handle('edify:bootstrap', async () => {
  await ensureAppDirs();
  const autosavePath = getAutosavePath();
  const installId = await getCurrentInstallId();
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    paths: {
      projects: getProjectsDir(),
      cache: getCacheDir(),
      userData: app.getPath('userData'),
      autosave: autosavePath
    },
    settings: storeData.settings,
    recentProjects: await getRecentProjectsForBootstrap(),
    recoveryAvailable: await pathExists(autosavePath),
    consentAccepted: Boolean(storeData.consentAcceptedAt) && storeData.consentInstallId === installId
  };
});

ipcMain.handle('edify:getDesktopAccount', async () => {
  await ensureAppDirs();
  return getStoredDesktopAccount();
});

ipcMain.handle('edify:startDesktopOAuth', async (_event, provider: DesktopAccountProvider) => {
  await ensureAppDirs();
  return startDesktopOAuth(provider);
});

ipcMain.handle('edify:signOutDesktopAccount', async () => {
  await ensureAppDirs();
  return signOutDesktopAccount();
});

ipcMain.handle('edify:acceptLaunchConsent', async (_event, mode: 'all' | 'essential') => {
  await ensureAppDirs();
  const installId = await getCurrentInstallId();
  storeData.consentAcceptedAt = new Date().toISOString();
  storeData.consentMode = mode;
  storeData.consentInstallId = installId;
  await persistStore();
  return { ok: true };
});

ipcMain.handle('edify:openThumbnailAdvancedWindow', async (_event, project: any) => {
  await ensureAppDirs();
  thumbnailAdvancedProject = project ?? null;
  await openThumbnailAdvancedWindow();
  return { ok: true };
});

ipcMain.handle('edify:getThumbnailAdvancedProject', async () => {
  await ensureAppDirs();
  return thumbnailAdvancedProject;
});

ipcMain.handle('edify:openEdifyStudioWindow', async (_event, project: any) => {
  await ensureAppDirs();
  edifyStudioSeedProject = project ?? null;
  await openEdifyStudioWindow();
  return { ok: true };
});

ipcMain.handle('edify:openAudioEditorWindow', async () => {
  await ensureAppDirs();
  await openAudioEditorWindow();
  return { ok: true };
});

ipcMain.handle('edify:getEdifyStudioSeedProject', async () => {
  await ensureAppDirs();
  return edifyStudioSeedProject;
});

ipcMain.handle('edify:getStudioBootstrap', async () => {
  await ensureAppDirs();
  return {
    recentProjects: storeData.studioRecentProjects,
    accountUser: await getStoredDesktopAccount()
  };
});

ipcMain.handle('edify:getAudioEditorBootstrap', async () => {
  await ensureAppDirs();
  return {
    recentProjects: storeData.audioRecentProjects,
    accountUser: await getStoredDesktopAccount()
  };
});

ipcMain.handle('edify:openExternalUrl', async (_event, url: string) => {
  await shell.openExternal(url);
  return { ok: true, url };
});

ipcMain.on('edify:updateWindowState', (_event, payload: { screen?: 'home' | 'editor'; saveStatus?: string; project?: any | null }) => {
  rendererWindowState = {
    screen: payload.screen === 'editor' ? 'editor' : 'home',
    saveStatus: payload.saveStatus ?? 'saved',
    project: payload.project ?? null
  };
});

ipcMain.handle('edify:saveProject', async (_event, payload: { document: any; filePath?: string }) => {
  return saveProjectDocument(payload.document, payload.filePath, false);
});

ipcMain.handle('edify:saveProjectAs', async (_event, document: any) => {
  return saveProjectDocument(document, undefined, true);
});

ipcMain.handle('edify:saveStudioProject', async (_event, payload: { document: any; filePath?: string }) => {
  await ensureAppDirs();
  return saveStudioProjectDocument(payload.document, payload.filePath, false);
});

ipcMain.handle('edify:saveStudioProjectAs', async (_event, document: any) => {
  await ensureAppDirs();
  return saveStudioProjectDocument(document, undefined, true);
});

ipcMain.handle('edify:saveAudioEditorProject', async (_event, payload: { document: any; filePath?: string }) => {
  await ensureAppDirs();
  return saveAudioProjectDocument(payload.document, payload.filePath, false);
});

ipcMain.handle('edify:saveAudioEditorProjectAs', async (_event, document: any) => {
  await ensureAppDirs();
  return saveAudioProjectDocument(document, undefined, true);
});

ipcMain.handle('edify:openStudioProjectDialog', async () => {
  await ensureAppDirs();
  const result = await dialog.showOpenDialog(edifyStudioWindow ?? mainWindow!, {
    title: 'Open Thumbnail Studio Project',
    properties: ['openFile'],
    filters: [
      { name: 'Thumbnail Studio Project', extensions: ['edifystudio'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const document = await readJsonFile(filePath);
  await addRecentStudioProject(projectSummaryFromDocument(filePath, document));
  return { canceled: false, filePath, document };
});

ipcMain.handle('edify:openAudioEditorProjectDialog', async () => {
  await ensureAppDirs();
  const result = await dialog.showOpenDialog(audioEditorWindow ?? mainWindow!, {
    title: 'Open Audio Editor Project',
    properties: ['openFile'],
    filters: [
      { name: 'Audio Editor Project', extensions: ['edifyaudio'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const document = await readJsonFile(filePath);
  await addRecentAudioProject(projectSummaryFromDocument(filePath, document));
  return { canceled: false, filePath, document };
});

ipcMain.handle('edify:saveStudioBinary', async (_event, payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) => {
  await ensureAppDirs();
  const safeName = (payload.suggestedName || 'Thumbnail Studio Export')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'Thumbnail Studio Export';
  const defaultDir = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf'].includes(payload.extension) ? app.getPath('pictures') : getStudioProjectsDir();
  const filePath = dialog.showSaveDialogSync(edifyStudioWindow ?? mainWindow!, {
    title: 'Export from Thumbnail Studio',
    defaultPath: path.join(defaultDir, `${safeName}.${payload.extension}`),
    filters: [
      { name: payload.extension.toUpperCase(), extensions: [payload.extension] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!filePath) {
    return { canceled: true };
  }

  const finalPath = filePath.toLowerCase().endsWith(`.${payload.extension}`) ? filePath : `${filePath}.${payload.extension}`;
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, Buffer.from(payload.buffer));
  return { canceled: false, filePath: finalPath };
});

ipcMain.handle('edify:saveAudioEditorBinary', async (_event, payload: { suggestedName: string; extension: string; mimeType: string; buffer: ArrayBuffer }) => {
  await ensureAppDirs();
  const safeName = (payload.suggestedName || 'Audio Export')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'Audio Export';
  const filePath = dialog.showSaveDialogSync(audioEditorWindow ?? mainWindow!, {
    title: 'Export from Audio Editor',
    defaultPath: path.join(app.getPath('music'), `${safeName}.${payload.extension}`),
    filters: [
      { name: payload.extension.toUpperCase(), extensions: [payload.extension] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!filePath) {
    return { canceled: true };
  }

  const finalPath = filePath.toLowerCase().endsWith(`.${payload.extension}`) ? filePath : `${filePath}.${payload.extension}`;
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, Buffer.from(payload.buffer));
  return { canceled: false, filePath: finalPath };
});

ipcMain.handle('edify:saveThumbnailPng', async (_event, payload: { fileName: string; buffer: ArrayBuffer }) => {
  const safeName = (payload.fileName || 'Edify Thumbnail')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'Edify Thumbnail';
  const defaultPath = path.join(app.getPath('pictures'), safeName.toLowerCase().endsWith('.png') ? safeName : `${safeName}.png`);
  const filePath = dialog.showSaveDialogSync(mainWindow!, {
    title: 'Export Thumbnail PNG',
    defaultPath,
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!filePath) {
    return { canceled: true };
  }

  const finalPath = filePath.toLowerCase().endsWith('.png') ? filePath : `${filePath}.png`;
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, Buffer.from(payload.buffer));
  return { canceled: false, filePath: finalPath };
});

ipcMain.handle('edify:openProjectDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Edify Project',
    properties: ['openFile'],
    filters: [{ name: 'Edify Project', extensions: ['edify', 'json'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const document = await readJsonFile(filePath);
  await addRecentProject(projectSummaryFromDocument(filePath, document));
  return { canceled: false, filePath, document };
});

ipcMain.handle('edify:openProjectPath', async (_event, filePath: string) => {
  if (isCloudProjectPath(filePath)) {
    return openCloudProject(filePath);
  }
  const document = await readJsonFile(filePath);
  await addRecentProject(projectSummaryFromDocument(filePath, document));
  return { filePath, document };
});

ipcMain.handle('edify:renameProject', async (_event, payload: { filePath: string; name: string }) => {
  if (isCloudProjectPath(payload.filePath)) {
    const document = await renameCloudProject(payload.filePath, payload.name);
    return { filePath: payload.filePath, document, recentProjects: await getRecentProjectsForBootstrap() };
  }
  const document = await readJsonFile(payload.filePath) as any;
  const nextDocument = {
    ...document,
    name: payload.name,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(payload.filePath, nextDocument);
  await addRecentProject(projectSummaryFromDocument(payload.filePath, nextDocument));
  await syncProjectToCloud(nextDocument).catch(() => false);
  return { filePath: payload.filePath, document: nextDocument, recentProjects: await getRecentProjectsForBootstrap() };
});

ipcMain.handle('edify:deleteProject', async (_event, filePath: string) => {
  if (isCloudProjectPath(filePath)) {
    await deleteCloudProject(filePath);
    return { ok: true, recentProjects: await getRecentProjectsForBootstrap() };
  }
  if (await pathExists(filePath)) {
    await fs.unlink(filePath);
  }
  storeData.recentProjects = storeData.recentProjects.filter((project) => project.path !== filePath);
  await persistStore();
  return { ok: true, recentProjects: await getRecentProjectsForBootstrap() };
});

ipcMain.handle('edify:importMedia', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import Media',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  return Promise.all(result.filePaths.map(toImportResult));
});

ipcMain.handle('edify:inspectDroppedFiles', async (_event, filePaths: string[]) => {
  return Promise.all(filePaths.map(toImportResult));
});

ipcMain.handle('edify:saveRecording', async (_event, payload: { name: string; buffer: ArrayBuffer }) => {
  return writeRecording(payload.name, payload.buffer);
});

ipcMain.handle('edify:relinkMedia', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Relink Missing Media',
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, asset: await toImportResult(result.filePaths[0]) };
});

ipcMain.handle('edify:writeAutosave', async (_event, document: any) => {
  await writeJsonFile(getAutosavePath(), {
    ...document,
    autosavedAt: new Date().toISOString()
  });
  return { ok: true };
});

ipcMain.handle('edify:readAutosave', async () => {
  const autosavePath = getAutosavePath();
  if (!(await pathExists(autosavePath))) {
    return null;
  }
  return readJsonFile(autosavePath);
});

ipcMain.handle('edify:clearAutosave', async () => {
  const autosavePath = getAutosavePath();
  if (await pathExists(autosavePath)) {
    await fs.unlink(autosavePath);
  }
  return { ok: true };
});

ipcMain.handle('edify:setSetting', async (_event, key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
  storeData.settings = {
    ...storeData.settings,
    [key]: value
  };
  await persistStore();
  return storeData.settings;
});

ipcMain.handle('edify:showItemInFolder', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
  return { ok: true };
});

function extensionForExportFormat(format?: string) {
  if (format === 'mov') return 'mov';
  if (format === 'webm') return 'webm';
  return 'mp4';
}

function normalizeExportPath(filePath: string, format?: string) {
  const extension = extensionForExportFormat(format);
  return path.extname(filePath) ? filePath : `${filePath}.${extension}`;
}

type ExportRequest = {
  outputPath?: string;
  fileName?: string;
  format?: string;
  projectName: string;
  preset: string;
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
  project?: any;
};

function parseResolution(value?: string) {
  const match = value?.match(/(\d+)\s*x\s*(\d+)/i);
  const width = match ? Number(match[1]) : 1920;
  const height = match ? Number(match[2]) : 1080;
  return {
    width: Number.isFinite(width) ? width : 1920,
    height: Number.isFinite(height) ? height : 1080
  };
}

function parseBitrateKbps(value?: string) {
  const mbps = Number.parseFloat(String(value ?? '16 Mbps').replace(',', '.'));
  return Math.max(1000, Math.round((Number.isFinite(mbps) ? mbps : 16) * 1000));
}

function ffmpegText(value: unknown) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .slice(0, 90);
}

function ffmpegPathIsUsable(filePath?: string) {
  return Boolean(
    filePath &&
      !filePath.startsWith('demo://') &&
      !filePath.startsWith('browser-file://') &&
      !filePath.startsWith('edify-sound://') &&
      existsSync(filePath)
  );
}

function getFfmpegPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'ffmpeg.exe');
  }
  return ffmpegStaticPath ?? path.join(__dirname, '../node_modules/ffmpeg-static/ffmpeg.exe');
}

function buildPlaceholderFilter(request: ExportRequest) {
  const project = request.project ?? {};
  const tracks = Array.isArray(project.tracks) ? project.tracks : [];
  const assets = Array.isArray(project.assets) ? project.assets : [];
  const clipCount = tracks.reduce((total: number, track: any) => total + (Array.isArray(track.clips) ? track.clips.length : 0), 0);
  const watermark = request.watermark !== false;
  const settings = project.settings ?? {};
  const resolution = request.resolution ?? `${settings.resolution?.width ?? 1920} x ${settings.resolution?.height ?? 1080}`;
  const { width, height } = parseResolution(resolution);
  const titleSize = Math.max(34, Math.round(height * 0.07));
  const subtitleSize = Math.max(18, Math.round(height * 0.025));
  const watermarkSize = Math.max(15, Math.round(height * 0.018));
  const title = ffmpegText(request.projectName || 'Edify Export').toUpperCase();
  const subtitle = ffmpegText(`${resolution}  ${request.fps ?? settings.fps ?? 30}fps  ${tracks.length} tracks  ${clipCount} clips  ${assets.length} assets`);
  const filters = [
    'format=yuv420p',
    `drawbox=x=${Math.round(width * 0.1)}:y=${Math.round(height * 0.13)}:w=${Math.round(width * 0.8)}:h=${Math.round(height * 0.66)}:color=0x41e8ff@0.18:t=3`,
    `drawbox=x=${Math.round(width * 0.08)}:y=${Math.round(height * 0.78)}:w=${Math.round(width * 0.84)}:h=3:color=0x41e8ff@0.85:t=fill`,
    `drawbox=x=${Math.round(width * 0.22)}:y=${Math.round(height * 0.24)}:w=${Math.round(width * 0.12)}:h=${Math.round(height * 0.2)}:color=0x1a6dff@0.24:t=fill`,
    `drawbox=x=${Math.round(width * 0.47)}:y=${Math.round(height * 0.2)}:w=${Math.round(width * 0.15)}:h=${Math.round(height * 0.26)}:color=0x42e8ff@0.15:t=fill`,
    `drawbox=x=${Math.round(width * 0.68)}:y=${Math.round(height * 0.18)}:w=${Math.round(width * 0.14)}:h=${Math.round(height * 0.28)}:color=0x8f6bff@0.2:t=fill`,
    `drawtext=text='${title}':x=(w-text_w)/2:y=(h-text_h)/2:fontcolor=white:fontsize=${titleSize}:shadowcolor=0x41e8ff@0.75:shadowx=0:shadowy=0`,
    `drawtext=text='${subtitle}':x=(w-text_w)/2:y=h*0.60:fontcolor=0xaeb9ce:fontsize=${subtitleSize}`
  ];
  if (watermark) {
    filters.push(`drawtext=text='Made with Edify Free':x=w-text_w-${Math.round(width * 0.03)}:y=h-text_h-${Math.round(height * 0.035)}:fontcolor=0xffd85d:fontsize=${watermarkSize}:box=1:boxcolor=0x05060a@0.65:boxborderw=12`);
  }
  return filters.join(',');
}

type RenderAsset = {
  id: string;
  kind: MediaKind;
  path: string;
  name?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
};

type RenderClip = {
  clip: any;
  asset: RenderAsset;
  inputIndex: number;
  trackIndex: number;
};

function getProjectAssets(request: ExportRequest): RenderAsset[] {
  return Array.isArray(request.project?.assets) ? request.project.assets : [];
}

function getProjectTracks(request: ExportRequest): any[] {
  return Array.isArray(request.project?.tracks) ? request.project.tracks : [];
}

function clipStart(clip: any) {
  return Math.max(0, Number(clip?.start) || 0);
}

function clipDuration(clip: any, fallback = 4) {
  return Math.max(0.05, Number(clip?.duration) || fallback);
}

function clipEnd(clip: any) {
  return clipStart(clip) + clipDuration(clip);
}

function normalizedHexColor(value: unknown, fallback = '#2e83ff') {
  const color = String(value || fallback).trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.replace('#', '0x') : fallback.replace('#', '0x');
}

function generatedClipSource(asset: RenderAsset, clip: any, width = 1920, height = 1080, fps = 30) {
  const baseColor =
    asset.kind === 'image'
      ? normalizedHexColor(clip.color, '#9f7cff')
      : asset.kind === 'audio'
        ? normalizedHexColor(clip.color, '#21d19f')
        : normalizedHexColor(clip.color, '#2e83ff');
  const title = ffmpegText(asset.name || clip.name || 'Edify clip');
  const fontSize = Math.max(28, Math.round(height * 0.05));
  return [
    `color=c=${baseColor}:s=${width}x${height}:r=${fps}`,
    `drawbox=x=w*0.08:y=h*0.12:w=w*0.84:h=h*0.70:color=${baseColor}@0.22:t=fill`,
    `drawbox=x=w*0.12:y=h*0.18:w=w*0.76:h=h*0.58:color=0x42e8ff@0.20:t=3`,
    `drawtext=text='${title}':x=(w-text_w)/2:y=(h-text_h)/2:fontcolor=white:fontsize=${fontSize}:shadowcolor=0x000000@0.75:shadowx=0:shadowy=4`
  ].join(',');
}

function buildTimelineInputs(request: ExportRequest, fps: number) {
  const assets = getProjectAssets(request);
  const tracks = getProjectTracks(request);
  const settings = request.project?.settings ?? {};
  const renderResolution = parseResolution(request.resolution ?? `${settings.resolution?.width ?? 1920} x ${settings.resolution?.height ?? 1080}`);
  const inputArgs: string[] = [];
  const visuals: RenderClip[] = [];
  const audio: RenderClip[] = [];
  let inputIndex = 1;

  tracks.forEach((track, trackIndex) => {
    if (track?.hidden || !Array.isArray(track.clips)) return;
    track.clips.forEach((clip: any) => {
      const asset = assets.find((item) => item.id === clip.assetId);
      if (!asset) return;
      const hasUsablePath = ffmpegPathIsUsable(asset.path);
      const start = Math.max(0, Number(clip.inPoint) || 0);
      const duration = clipDuration(clip);
      if (clip.kind === 'audio' || asset.kind === 'audio') {
        if (!hasUsablePath) return;
        inputArgs.push('-ss', String(start), '-t', String(duration), '-i', asset.path);
        audio.push({ clip, asset, inputIndex, trackIndex });
        inputIndex += 1;
        return;
      }
      if (clip.kind === 'image' || asset.kind === 'image') {
        if (hasUsablePath) {
          inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', String(duration), '-i', asset.path);
        } else {
          inputArgs.push('-f', 'lavfi', '-t', String(duration), '-i', generatedClipSource(asset, clip, renderResolution.width, renderResolution.height, fps));
        }
        visuals.push({ clip, asset, inputIndex, trackIndex });
        inputIndex += 1;
        return;
      }
      if (clip.kind === 'video' || asset.kind === 'video') {
        if (hasUsablePath) {
          inputArgs.push('-ss', String(start), '-t', String(duration), '-i', asset.path);
        } else {
          inputArgs.push('-f', 'lavfi', '-t', String(duration), '-i', generatedClipSource(asset, clip, renderResolution.width, renderResolution.height, fps));
        }
        visuals.push({ clip, asset, inputIndex, trackIndex });
        inputIndex += 1;
      }
    });
  });

  return { inputArgs, visuals, audio };
}

function overlayExpression(value: unknown) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${Math.round(number)}` : `${Math.round(number)}`;
}

function buildMediaFilter(input: RenderClip, width: number, height: number) {
  const transform = input.clip.transform ?? {};
  const scale = Math.max(0.05, Number(transform.scale) || 1);
  const opacity = Math.max(0, Math.min(1, Number(transform.opacity ?? 1)));
  const rotation = Number(transform.rotation) || 0;
  const targetWidth = Math.max(2, Math.round(width * scale));
  const targetHeight = Math.max(2, Math.round(height * scale));
  const filters = [
    `[${input.inputIndex}:v]`,
    `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
    rotation ? `rotate=${(rotation * Math.PI / 180).toFixed(6)}:c=none:ow=rotw(iw):oh=roth(ih)` : '',
    'format=rgba',
    opacity < 1 ? `colorchannelmixer=aa=${opacity.toFixed(3)}` : '',
    `setpts=PTS-STARTPTS+${clipStart(input.clip).toFixed(3)}/TB`,
    `[clipv${input.inputIndex}]`
  ].filter(Boolean);
  return filters.join(',');
}

function buildTimelineFilter(request: ExportRequest, duration: number, width: number, height: number, renderPlan: ReturnType<typeof buildTimelineInputs>) {
  const filters: string[] = ['[0:v]format=rgba[canvas0]'];
  let currentLabel = 'canvas0';
  let canvasIndex = 0;
  const sortedVisuals = [...renderPlan.visuals].sort((a, b) => b.trackIndex - a.trackIndex || clipStart(a.clip) - clipStart(b.clip));

  for (const visual of sortedVisuals) {
    filters.push(buildMediaFilter(visual, width, height));
    const nextLabel = `canvas${canvasIndex + 1}`;
    filters.push(
      `[${currentLabel}][clipv${visual.inputIndex}]overlay=x='(W-w)/2${overlayExpression(visual.clip.transform?.x)}':y='(H-h)/2${overlayExpression(visual.clip.transform?.y)}':enable='between(t,${clipStart(visual.clip).toFixed(3)},${clipEnd(visual.clip).toFixed(3)})':eof_action=pass[${nextLabel}]`
    );
    currentLabel = nextLabel;
    canvasIndex += 1;
  }

  const textClips = getProjectTracks(request)
    .flatMap((track, trackIndex) => (track?.hidden || !Array.isArray(track.clips) ? [] : track.clips.map((clip: any) => ({ clip, trackIndex }))))
    .filter(({ clip }) => clip.kind === 'text')
    .sort((a, b) => b.trackIndex - a.trackIndex || clipStart(a.clip) - clipStart(b.clip));

  for (const { clip } of textClips) {
    const nextLabel = `canvas${canvasIndex + 1}`;
    const text = ffmpegText(clip.text || clip.name || 'Text');
    const styleKey = `${clip.name || ''} ${(Array.isArray(clip.effects) ? clip.effects : []).map((effect: any) => effect.name).join(' ')}`.toLowerCase();
    const isBoxed = /lower third|callout|creator pop|stream alert|killfeed|hud|caption/.test(styleKey);
    const isCinema = /cinematic|festival|anamorphic|trailer|credit/.test(styleKey);
    const fontSize = Math.max(18, Math.round(64 * Math.max(0.2, Number(clip.transform?.scale) || 1) * (isCinema ? 1.05 : 1)));
    const opacity = Math.max(0, Math.min(1, Number(clip.transform?.opacity ?? 1)));
    const color = /creator pop|stream alert/.test(styleKey) ? '0x05060a' : String(clip.color ?? '#ffffff').replace('#', '0x');
    const shadowColor = /rank|hud|diamond|neon|trailer/.test(styleKey) ? '0x42e8ff@0.88' : '0x000000@0.70';
    const yExpression = isCinema || /trailer/.test(styleKey) ? 'h*0.48' : 'h*0.72';
    const boxOptions = isBoxed
      ? `:box=1:boxcolor=${/creator pop|stream alert/.test(styleKey) ? '0x42e8ff@0.90' : '0x05060a@0.72'}:boxborderw=${Math.max(10, Math.round(fontSize * 0.28))}`
      : '';
    filters.push(
      `[${currentLabel}]drawtext=text='${text}':x='(w-text_w)/2${overlayExpression(clip.transform?.x)}':y='${yExpression}${overlayExpression(clip.transform?.y)}':fontcolor=${color}@${opacity.toFixed(3)}:fontsize=${fontSize}:shadowcolor=${shadowColor}:shadowx=0:shadowy=4${boxOptions}:enable='between(t,${clipStart(clip).toFixed(3)},${clipEnd(clip).toFixed(3)})'[${nextLabel}]`
    );
    currentLabel = nextLabel;
    canvasIndex += 1;
  }

  if (request.watermark !== false) {
    const nextLabel = `canvas${canvasIndex + 1}`;
    const watermarkSize = Math.max(15, Math.round(height * 0.018));
    filters.push(
      `[${currentLabel}]drawtext=text='Made with Edify Free':x=w-text_w-${Math.round(width * 0.03)}:y=h-text_h-${Math.round(height * 0.035)}:fontcolor=0xffd85d:fontsize=${watermarkSize}:box=1:boxcolor=0x05060a@0.65:boxborderw=12[${nextLabel}]`
    );
    currentLabel = nextLabel;
  }

  filters.push(`[${currentLabel}]format=yuv420p[vout]`);

  if (request.includeAudio === false) {
    return { filterComplex: filters.join(';'), hasAudio: false };
  }

  if (renderPlan.audio.length === 0) {
    filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration.toFixed(3)}[aout]`);
    return { filterComplex: filters.join(';'), hasAudio: true };
  }

  const audioLabels: string[] = [];
  renderPlan.audio.forEach((audioClip, index) => {
    const delay = Math.round(clipStart(audioClip.clip) * 1000);
    const volume = Math.max(0, Math.min(2, Number(audioClip.clip.audio?.volume ?? 1)));
    const label = `aud${index}`;
    filters.push(
      `[${audioClip.inputIndex}:a]asetpts=PTS-STARTPTS,volume=${volume.toFixed(3)},adelay=${delay}|${delay}[${label}]`
    );
    audioLabels.push(`[${label}]`);
  });

  if (audioLabels.length === 1) {
    filters.push(`${audioLabels[0]}atrim=duration=${duration.toFixed(3)}[aout]`);
  } else {
    filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,atrim=duration=${duration.toFixed(3)}[aout]`);
  }

  return { filterComplex: filters.join(';'), hasAudio: true };
}

function runFfmpegExport(jobId: string, outputPath: string, request: ExportRequest) {
  const ffmpegPath = getFfmpegPath();
  const projectDuration = Number(request.project?.duration) || 8;
  const duration = Math.max(1, projectDuration);
  const { width, height } = parseResolution(request.resolution);
  const fps = Math.max(1, Math.round(Number(request.fps) || Number(request.project?.settings?.fps) || 30));
  const bitrate = `${parseBitrateKbps(request.bitrate)}k`;
  const renderPlan = buildTimelineInputs(request, fps);
  const hasTimelineVideo = renderPlan.visuals.length > 0;
  const timelineFilter = hasTimelineVideo
    ? buildTimelineFilter(request, duration, width, height, renderPlan)
    : { filterComplex: buildPlaceholderFilter(request), hasAudio: request.includeAudio !== false };
  const needsFallbackAudio = timelineFilter.hasAudio && !hasTimelineVideo && renderPlan.audio.length === 0;
  const args = [
    '-hide_banner',
    '-y',
    '-nostats',
    '-progress',
    'pipe:1',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x05060a:s=${width}x${height}:r=${fps}`,
    ...renderPlan.inputArgs,
    ...(needsFallbackAudio ? ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'] : []),
    ...(hasTimelineVideo ? ['-filter_complex', timelineFilter.filterComplex, '-map', '[vout]'] : ['-vf', timelineFilter.filterComplex]),
    ...(timelineFilter.hasAudio && hasTimelineVideo ? ['-map', '[aout]'] : []),
    '-c:v',
    request.format === 'webm' ? 'libvpx-vp9' : 'libx264',
    '-preset',
    request.format === 'webm' ? 'fast' : 'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    bitrate,
    ...(!timelineFilter.hasAudio
      ? ['-an']
      : hasTimelineVideo
        ? request.format === 'webm'
          ? ['-c:a', 'libopus', '-b:a', '160k']
          : ['-c:a', 'aac', '-b:a', '192k']
        : request.format === 'webm'
        ? ['-c:a', 'libopus', '-b:a', '160k']
        : ['-c:a', 'aac', '-b:a', '192k']),
    ...(request.format === 'webm' ? [] : ['-movflags', '+faststart']),
    '-t',
    String(duration),
    outputPath
  ];
  const child = spawn(ffmpegPath, args, {
    windowsHide: true,
    env: {
      ...process.env,
      FONTCONFIG_PATH: app.getPath('userData')
    }
  });
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    const match = text.match(/out_time_ms=(\d+)/);
    if (!match) return;
    const elapsedSeconds = Number(match[1]) / 1_000_000;
    const progress = Math.min(99, Math.max(1, Math.round((elapsedSeconds / duration) * 100)));
    mainWindow?.webContents.send('edify:exportProgress', {
      jobId,
      progress,
      outputPath,
      state: 'rendering'
    });
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8').slice(-3000);
  });
  child.on('error', (error) => {
    exportJobs.delete(jobId);
    mainWindow?.webContents.send('edify:exportProgress', {
      jobId,
      progress: 100,
      outputPath: `FFmpeg error: ${error.message}`,
      state: 'failed'
    });
  });
  child.on('close', (code) => {
    exportJobs.delete(jobId);
    mainWindow?.webContents.send('edify:exportProgress', {
      jobId,
      progress: 100,
      outputPath: code === 0 ? outputPath : `Export failed: ${stderr || `ffmpeg exited with ${code}`}`,
      state: code === 0 ? 'complete' : 'failed'
    });
  });
  exportJobs.set(jobId, {
    cancel: () => {
      child.kill();
    }
  });
}

ipcMain.handle('edify:chooseExportPath', async (_event, request: { fileName: string; format?: string }) => {
  const extension = extensionForExportFormat(request.format);
  const result = dialog.showSaveDialogSync(mainWindow!, {
    title: 'Choose Export File',
    defaultPath: path.join(app.getPath('videos'), request.fileName || `Edify Export.${extension}`),
    filters: [
      { name: extension.toUpperCase(), extensions: [extension] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result) {
    return { canceled: true };
  }

  return { canceled: false, filePath: normalizeExportPath(result, request.format) };
});

ipcMain.handle('edify:startExport', async (_event, request: ExportRequest) => {
  const extension = extensionForExportFormat(request.format);
  const requestedName = request.fileName || `${request.projectName || 'Edify Export'}.${extension}`;
  const outputPath = request.outputPath
    ? normalizeExportPath(request.outputPath, request.format)
    : dialog.showSaveDialogSync(mainWindow!, {
        title: 'Export Video',
        defaultPath: path.join(app.getPath('videos'), requestedName),
        filters: [
          { name: extension.toUpperCase(), extensions: [extension] },
          { name: 'MP4 Video', extensions: ['mp4'] },
          { name: 'MOV Video', extensions: ['mov'] },
          { name: 'WebM Video', extensions: ['webm'] }
        ]
      });

  if (!outputPath) {
    return { canceled: true };
  }

  const finalOutputPath = normalizeExportPath(outputPath, request.format);
  const jobId = randomUUID();
  await fs.mkdir(path.dirname(finalOutputPath), { recursive: true });
  mainWindow?.webContents.send('edify:exportProgress', {
    jobId,
    progress: 1,
    outputPath: finalOutputPath,
    state: 'rendering'
  });
  runFfmpegExport(jobId, finalOutputPath, request);

  return { canceled: false, jobId, outputPath: finalOutputPath };
});

ipcMain.handle('edify:cancelExport', async (_event, jobId: string) => {
  const job = exportJobs.get(jobId);
  if (job) {
    job.cancel();
    exportJobs.delete(jobId);
  }
  return { ok: true };
});

ipcMain.handle('edify:windowMinimize', async () => {
  mainWindow?.minimize();
  return { ok: true };
});

ipcMain.handle('edify:windowClose', async () => {
  if (!mainWindow) return { ok: false };
  if (projectNeedsSavePrompt()) {
    if (!mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('edify:requestClose');
      mainWindow.focus();
    }
    return { ok: false, requiresConfirmation: true };
  }
  allowWindowClose = true;
  mainWindow.close();
  return { ok: true };
});

ipcMain.handle('edify:closeCurrentWindow', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { ok: false };
  win.close();
  return { ok: true };
});

ipcMain.handle('edify:forceWindowClose', async () => {
  if (!mainWindow) return { ok: false };
  allowWindowClose = true;
  mainWindow.close();
  return { ok: true };
});
