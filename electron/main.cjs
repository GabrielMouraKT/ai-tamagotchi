'use strict';
// Janela desktop do AI Tamagotchi (Electron). Nenhum navegador externo: o painel é uma BrowserWindow
// que carrega o servidor local (127.0.0.1) iniciado dentro deste mesmo processo.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dock = require('./dock-logic.cjs');
const { createServer } = require('../server');
const installer = require('../lib/installer');

const MIN = { width: 330, height: 490 };
let win = null, server = null, origin = '', helper = null, helperRetries = 0, quitting = false;
let prefs = { pinned: true, docked: false, bounds: null, terminal: null };
let terminals = [], lastFg = null, side = null, lastSig = '', ignoreMoveUntil = 0, saveTimer = null;
const helperStatus = { ok: null, error: null };

/* ---------- Preferências (posição, tamanho, sempre à frente, acoplado, terminal escolhido) ---------- */
const prefsFile = () => path.join(app.getPath('userData'), 'window.json');
function loadPrefs() {
  try { const p = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); if (p && typeof p === 'object') prefs = { ...prefs, ...p }; } catch { /* primeira execução ou arquivo ilegível */ }
}
function savePrefsNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (win && !win.isDestroyed() && !win.isMinimized()) prefs.bounds = win.getBounds();
  try { fs.mkdirSync(path.dirname(prefsFile()), { recursive: true }); fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2)); } catch (e) { console.error('Não consegui salvar window.json:', e.code || e.message); }
}
const savePrefsSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(savePrefsNow, 400); };

/* ---------- Terminal fixado ---------- */
// Ao grudar, o mascote fica preso AQUELE terminal (hwnd) e o acompanha ao mover/redimensionar, mesmo que o foco mude.
let needRebind = false;
const pick = () => dock.pickTarget(terminals, prefs.terminal, lastFg, !needRebind);
function pinCurrent() { const { target } = dock.pickTarget(terminals, null, lastFg); prefs.terminal = target ? { hwnd: target.hwnd, kind: target.kind } : null; }

/* ---------- Estado enviado à interface ---------- */
function publicState() {
  const { target, mode } = pick();
  return {
    docked: !!prefs.docked, pinned: prefs.pinned !== false, side,
    helper: { ok: helperStatus.ok, error: helperStatus.error },
    mode, targetKey: target ? target.key : null, manualKind: prefs.terminal ? prefs.terminal.kind : null,
    terminals: terminals.map(t => ({ key: t.key, label: t.label, process: t.process, title: t.title, foreground: t.foreground })),
  };
}
const sendState = () => { if (win && !win.isDestroyed()) win.webContents.send('desktop-state', publicState()); };

/* ---------- Acoplar ao terminal ---------- */
function applyDock(force = false) {
  if (!win || win.isDestroyed() || !prefs.docked || win.isMinimized()) return;
  const { target } = pick();
  if (!target) return;
  // O helper devolve pixels físicos (DPI v2); o Electron trabalha em DIP.
  const rect = screen.screenToDipRect(null, { x: target.x, y: target.y, width: target.width, height: target.height });
  const wb = win.getBounds();
  const sig = [target.hwnd, rect.x, rect.y, rect.width, rect.height, wb.width, wb.height].join(',');
  if (!force && sig === lastSig) return;       // só reposiciona quando o terminal (ou o tamanho da janela) mudou
  lastSig = sig;
  const area = screen.getDisplayMatching(rect).workArea;
  const pos = dock.placeBeside(rect, { width: wb.width, height: wb.height }, area, 4);
  side = pos.side;
  ignoreMoveUntil = Date.now() + 600;
  win.setBounds({ x: pos.x, y: pos.y, width: wb.width, height: wb.height }); // setBounds (não setPosition): evita mudar o tamanho entre monitores com DPI diferente
  sendState();
}

function onHelperLine(line) {
  let payload; try { payload = JSON.parse(line.replace(/^﻿/, '')); } catch { return; }
  helperStatus.ok = true; helperStatus.error = null; helperRetries = 0;
  const next = dock.normalize(payload);
  const fg = next.find(t => t.foreground); if (fg) lastFg = fg.hwnd;
  const sigList = JSON.stringify(next.map(t => [t.key, t.title, t.foreground]));
  const changedList = sigList !== onHelperLine.last; onHelperLine.last = sigList;
  terminals = next;
  if (needRebind && prefs.terminal) {          // app reaberto: os hwnd salvos não valem mais; reata ao mesmo tipo de terminal
    if (next.some(t => t.hwnd === prefs.terminal.hwnd)) needRebind = false;
    else { const t = next.find(x => x.kind === prefs.terminal.kind); if (t) { prefs.terminal = { hwnd: t.hwnd, kind: t.kind }; needRebind = false; savePrefsSoon(); } }
  }
  if (changedList) sendState();
  applyDock();
}

function startHelper() {
  if (process.platform !== 'win32') { helperStatus.ok = false; helperStatus.error = 'Acoplar só funciona no Windows.'; return; }
  // Instalado: o script fica em app.asar.unpacked (o PowerShell não lê dentro do .asar).
  const script = path.join(__dirname, 'follow-terminal.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  let buf = '', errTail = '';
  helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ParentPid', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  helper.stdout.setEncoding('utf8'); helper.stderr.setEncoding('utf8');
  helper.stdout.on('data', chunk => { buf += chunk; let i; while ((i = buf.indexOf('\n')) !== -1) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onHelperLine(line); } });
  helper.stderr.on('data', c => { errTail = (errTail + c).slice(-300); });
  helper.on('error', e => { helperStatus.ok = false; helperStatus.error = 'PowerShell indisponível: ' + e.code; sendState(); });
  helper.on('exit', code => {
    helper = null; if (quitting) return;
    if (helperRetries < 3) { helperRetries++; setTimeout(startHelper, 1500); return; }
    helperStatus.ok = false; helperStatus.error = `Helper encerrou (código ${code}). ${errTail.trim()}`.trim(); sendState();
  });
}

/* ---------- Janela ---------- */
// Borda nativa do Windows 11 na cor do mascote: uma única borda, sem linha dupla (a interface não desenha borda própria).
function applyAccent() {
  try { if (win && !win.isDestroyed() && typeof win.setAccentColor === 'function') win.setAccentColor(prefs.accent || '#ff922d'); } catch { /* Windows < 11: sem efeito */ }
}
function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const area = prefs.bounds ? screen.getDisplayMatching(prefs.bounds).workArea : wa;
  const b = dock.clampBounds(prefs.bounds || { x: wa.x + wa.width - 405, y: wa.y + 60, width: 395, height: 810 }, area, MIN);
  win = new BrowserWindow({
    ...b, minWidth: MIN.width, minHeight: MIN.height, frame: false, resizable: true, maximizable: false, fullscreenable: false,
    show: false, title: 'AI Tamagotchi', backgroundColor: '#10101c', autoHideMenuBar: true, icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.setAlwaysOnTop(prefs.pinned !== false, 'floating');
  applyAccent();
  win.once('ready-to-show', () => win.show());
  // Nunca abre navegador/janelas externas e não navega para fora do servidor local.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) e.preventDefault(); });
  win.webContents.on('did-finish-load', sendState);
  win.on('will-move', () => { if (prefs.docked && Date.now() > ignoreMoveUntil) { prefs.docked = false; side = null; savePrefsSoon(); sendState(); } }); // arrastar à mão desgruda
  win.on('moved', savePrefsSoon);
  win.on('resized', () => { if (prefs.docked) applyDock(true); savePrefsSoon(); });
  win.on('close', savePrefsNow);
  win.on('closed', () => { win = null; });
  win.loadURL(origin);
}

ipcMain.handle('window-action', (event, action, arg) => {
  if (!win || event.sender !== win.webContents || !dock.ACTIONS.has(action)) return null;
  if (action === 'close') win.close();
  else if (action === 'minimize') win.minimize();
  else if (action === 'pin') { prefs.pinned = !(prefs.pinned !== false); win.setAlwaysOnTop(prefs.pinned, 'floating'); }
  else if (action === 'dock') {
    prefs.docked = !prefs.docked; side = null;
    if (prefs.docked) { if (!prefs.terminal || !terminals.some(t => t.hwnd === prefs.terminal.hwnd)) { needRebind = false; pinCurrent(); } applyDock(true); }
  }
  else if (action === 'accent') { if (typeof arg === 'string' && /^#[0-9a-f]{6}$/i.test(arg)) { prefs.accent = arg; applyAccent(); } }
  else if (action === 'terminal') {
    const t = typeof arg === 'string' ? terminals.find(x => x.key === arg) : null;
    needRebind = false;
    if (t) prefs.terminal = { hwnd: t.hwnd, kind: t.kind };
    else if (prefs.docked) pinCurrent();     // "automático" enquanto grudado = fixa no terminal em foco agora
    else prefs.terminal = null;
    if (prefs.docked) applyDock(true);
  }
  savePrefsSoon(); sendState();
  return publicState();
});
// "Conectar ao Claude Code": mescla só a chave statusLine (backup + recusa sobrescrever outra). Só roda por clique do usuário.
function statuslineCommand() {
  if (app.isPackaged) return `"${path.join(process.resourcesPath, 'statusline.cmd').replace(/\\/g, '/')}"`; // instalado: sem Node necessário
  return `node "${path.resolve(__dirname, '..', 'statusline.js').replace(/\\/g, '/')}"`;
}
ipcMain.handle('connect-claude', (event, mode) => {
  if (!win || event.sender !== win.webContents) return null;
  const r = installer.apply({ command: statuslineCommand(), remove: mode === 'remove' });
  return { status: r.status, backup: r.backup || null };
});
ipcMain.handle('get-state', event => (win && event.sender === win.webContents ? publicState() : null));

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    loadPrefs(); needRebind = !!prefs.terminal;
    server = createServer({ port: 0 });                       // porta livre, só 127.0.0.1, dentro deste processo
    const port = await server.start(); origin = `http://127.0.0.1:${port}`;
    createWindow(); startHelper();
  });
  app.on('before-quit', () => { quitting = true; savePrefsNow(); try { helper?.kill(); } catch {} try { server?.close(); } catch {} });
  app.on('window-all-closed', () => app.quit());
}
