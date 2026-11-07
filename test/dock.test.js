'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process'), path = require('node:path'), fs = require('node:fs');
const D = require('../electron/dock-logic.cjs');

const T = (hwnd, o = {}) => ({ hwnd, cls: 'CASCADIA_HOSTING_WINDOW_CLASS', process: 'WindowsTerminal', title: 't' + hwnd, x: 100, y: 100, width: 800, height: 600, foreground: false, ...o });
const list = (...ts) => D.normalize({ terminals: ts });
const AREA = { x: 0, y: 0, width: 1920, height: 1040 };

test('normalize: aceita só Windows Terminal/console com geometria válida; descarta o resto', () => {
  const l = list(T(1), T(2, { cls: 'ConsoleWindowClass', process: 'conhost' }), T(3, { cls: 'Chrome_WidgetWin_1' }), T(4, { width: 50 }), T(5, { x: 'a' }), null);
  assert.deepEqual(l.map(t => [t.hwnd, t.kind]), [[1, 'terminal'], [2, 'console']]);
  assert.deepEqual(D.normalize(null), []); assert.deepEqual(D.normalize({}), []); assert.deepEqual(D.normalize({ terminals: 'x' }), []);
});
test('normalize: título é truncado e o conteúdo do terminal nunca aparece nos campos', () => {
  const [t] = list(T(1, { title: 'x'.repeat(500) }));
  assert.equal(t.title.length, 80); assert.deepEqual(Object.keys(t).sort(), ['foreground', 'height', 'hwnd', 'key', 'kind', 'label', 'process', 'title', 'width', 'x', 'y']);
});
test('destino automático: em foco > último em foco > topo da pilha', () => {
  const l = list(T(1), T(2, { foreground: true }), T(3));
  assert.equal(D.pickTarget(l, null, null).target.hwnd, 2);
  assert.equal(D.pickTarget(list(T(1), T(2), T(3)), null, 3).target.hwnd, 3);
  assert.equal(D.pickTarget(list(T(1), T(2)), null, 99).target.hwnd, 1);
  assert.deepEqual(D.pickTarget([], null, null), { target: null, mode: 'auto' });
  assert.ok(D.ACTIONS.has('accent'));
});
test('vários terminais: escolha manual persiste por hwnd; se a janela fechou, usa o mesmo tipo; senão automático', () => {
  const l = list(T(1, { foreground: true }), T(2));
  assert.deepEqual([D.pickTarget(l, { hwnd: 2, kind: 'terminal' }, null).target.hwnd, D.pickTarget(l, { hwnd: 2, kind: 'terminal' }, null).mode], [2, 'manual']);
  assert.equal(D.pickTarget(list(T(5), T(6)), { hwnd: 2, kind: 'terminal' }, null).target.hwnd, 5);          // hwnd antigo sumiu, mesmo tipo
  const r = D.pickTarget(list(T(7, { cls: 'ConsoleWindowClass' })), { hwnd: 2, kind: 'terminal' }, null);    // nenhum do tipo
  assert.equal(r.target.hwnd, 7); assert.equal(r.mode, 'manual-fallback');
});
test('terminal fixado (strict): acompanha só aquela janela, ignora foco; se fechar, não pula para outro', () => {
  const pref = { hwnd: 2, kind: 'terminal' };
  const l = list(T(1, { foreground: true }), T(2));
  assert.equal(D.pickTarget(l, pref, 1, true).target.hwnd, 2);                 // foco está no 1, mas segue o 2
  const gone = D.pickTarget(list(T(1, { foreground: true }), T(3)), pref, 1, true);
  assert.equal(gone.target, null); assert.equal(gone.mode, 'manual-missing');   // 2 fechou: fica parado
  assert.equal(D.pickTarget(list(T(5)), pref, null, false).target.hwnd, 5);     // reabertura do app: reata ao mesmo tipo
  assert.deepEqual(D.pickTarget([], pref, null, true), { target: null, mode: 'manual-missing' });
});
test('posição: prefere a direita; alterna para a esquerda se faltar espaço; senão encosta na borda', () => {
  const win = { width: 395, height: 810 };
  assert.deepEqual(D.placeBeside({ x: 100, y: 120, width: 800, height: 600 }, win, AREA), { x: 904, y: 120, side: 'right' });
  assert.deepEqual(D.placeBeside({ x: 1000, y: 50, width: 800, height: 600 }, win, AREA), { x: 601, y: 50, side: 'left' });
  const wide = D.placeBeside({ x: 0, y: 0, width: 1900, height: 600 }, win, AREA);
  assert.equal(wide.side, 'clamp'); assert.equal(wide.x, 1920 - 395);
});
test('posição: y e x ficam dentro da área útil (terminal alto, fora da tela, segundo monitor)', () => {
  const win = { width: 395, height: 810 };
  assert.equal(D.placeBeside({ x: 100, y: 700, width: 800, height: 300 }, win, AREA).y, 1040 - 810);
  assert.equal(D.placeBeside({ x: 100, y: -200, width: 800, height: 300 }, win, AREA).y, 0);
  const mon2 = { x: 1920, y: 0, width: 1280, height: 1024 };
  const p = D.placeBeside({ x: 1930, y: 10, width: 500, height: 500 }, win, mon2); assert.equal(p.side, 'right'); assert.equal(p.x, 1930 + 500 + 4);
});
test('janela: tamanho mínimo 330×490, dentro da tela, valores ruins usam padrão', () => {
  assert.deepEqual(D.clampBounds({ x: 10, y: 10, width: 100, height: 100 }, AREA), { x: 10, y: 10, width: 330, height: 490 });
  const c = D.clampBounds({ x: 5000, y: 5000, width: 395, height: 810 }, AREA); assert.ok(c.x < 1920 && c.y < 1040);
  const d = D.clampBounds({}, AREA); assert.equal(d.width, 395); assert.ok(d.x >= 0 && d.y >= 0);
  assert.equal(D.clampBounds({ x: 0, y: 0, width: 9999, height: 9999 }, AREA).width, 1920);
});
test('ações do IPC: lista fechada', () => {
  for (const a of ['close', 'minimize', 'pin', 'dock', 'terminal']) assert.ok(D.ACTIONS.has(a));
  for (const a of ['quit', 'eval', 'openExternal', '']) assert.ok(!D.ACTIONS.has(a));
});

test('main.cjs: sem navegador externo, sem spawn do execPath, com instância única e janela sem moldura', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.ok(!/openExternal/.test(src)); assert.ok(!/spawn\(process\.execPath/.test(src));
  assert.ok(!/\bshell\b[^\n]*require\('electron'\)/.test(src)); // o módulo `shell` (abre navegador/Explorer) nem é importado
  assert.match(src, /app\.asar\.unpacked/);   // helper PowerShell lido fora do .asar quando instalado
  assert.match(src, /requestSingleInstanceLock/); assert.match(src, /frame: false/); assert.match(src, /minWidth: MIN\.width/);
  assert.match(src, /contextIsolation: true/); assert.match(src, /sandbox: true/); assert.match(src, /127\.0\.0\.1/);
  assert.ok(!/googleapis|https?:\/\/(?!127)/.test(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('helper Win32 (somente Windows): executa e devolve JSON válido, sem acessar conteúdo de terminal', { skip: process.platform !== 'win32' }, () => {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'electron', 'follow-terminal.ps1'), '-Once'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.trim().replace(/^﻿/, '')); assert.ok(Array.isArray(j.terminals));
  const l = D.normalize(j); assert.equal(l.length, j.terminals.length);
  for (const t of j.terminals) assert.deepEqual(Object.keys(t).sort(), ['cls', 'foreground', 'height', 'hwnd', 'pid', 'process', 'title', 'width', 'x', 'y']);
});
