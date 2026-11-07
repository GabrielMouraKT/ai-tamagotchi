'use strict';
// Lógica pura do acoplamento (sem Electron, sem Win32): testável com node:test.
// O helper só informa classe, título, PID, processo e retângulo da janela. Nunca o conteúdo do terminal.

const KINDS = { CASCADIA_HOSTING_WINDOW_CLASS: 'terminal', ConsoleWindowClass: 'console' };
const KIND_LABEL = { terminal: 'Windows Terminal', console: 'Console (cmd/PowerShell)' };
const finite = n => typeof n === 'number' && Number.isFinite(n);

// Valida a linha JSON do helper -> lista normalizada (descarta o que for inválido).
function normalize(payload) {
  const raw = payload && Array.isArray(payload.terminals) ? payload.terminals : [];
  const out = [];
  for (const t of raw) {
    if (!t || !finite(t.hwnd) || !finite(t.x) || !finite(t.y) || !finite(t.width) || !finite(t.height)) continue;
    const kind = KINDS[t.cls];
    if (!kind || t.width < 200 || t.height < 120) continue;
    out.push({
      key: String(t.hwnd), hwnd: t.hwnd, kind, label: KIND_LABEL[kind], process: String(t.process || ''),
      title: String(t.title || '').slice(0, 80), x: t.x, y: t.y, width: t.width, height: t.height, foreground: !!t.foreground,
    });
  }
  return out;
}

// Escolhe o destino. (Detalhes de `strict` logo abaixo.) `pref` = {hwnd, kind} (escolha manual do usuário) ou null (automático).
// Ordem manual: mesma janela (hwnd) > primeira do mesmo tipo > cai para automático (sem apagar a preferência).
// Automático: terminal em primeiro plano > último que esteve em primeiro plano > topo da pilha de janelas.
// `strict`: o terminal fixado é só aquela janela (hwnd). Se ela fechar, não há destino (o mascote fica parado);
// sem `strict` (usado uma vez ao reabrir o app, quando os hwnd antigos já não existem) cai para o mesmo tipo.
function pickTarget(list, pref, lastFgHwnd, strict = false) {
  if (pref) {
    const exact = list.find(t => t.hwnd === pref.hwnd) || (strict ? null : list.find(t => t.kind === pref.kind));
    if (exact) return { target: exact, mode: 'manual' };
    if (strict) return { target: null, mode: 'manual-missing' };
  }
  if (!list.length) return { target: null, mode: pref ? 'manual' : 'auto' };
  const auto = list.find(t => t.foreground) || list.find(t => t.hwnd === lastFgHwnd) || list[0];
  return { target: auto, mode: pref ? 'manual-fallback' : 'auto' };
}

// Posição da janela do mascote ao lado do terminal (tudo em DIP, na mesma unidade).
// Prefere a direita; se não couber na área útil, usa a esquerda; se nenhum lado couber, fica no limite da tela.
function placeBeside(term, win, area, gap = 4) {
  const right = term.x + term.width + gap, left = term.x - win.width - gap;
  let side, x;
  if (right + win.width <= area.x + area.width) { side = 'right'; x = right; }
  else if (left >= area.x) { side = 'left'; x = left; }
  else { side = 'clamp'; x = Math.max(area.x, Math.min(right, area.x + area.width - win.width)); }
  const y = Math.max(area.y, Math.min(term.y, area.y + area.height - win.height));
  return { x: Math.round(x), y: Math.round(y), side };
}

// Mantém a janela dentro de alguma área útil e respeita o tamanho mínimo.
function clampBounds(b, area, min = { width: 330, height: 490 }) {
  const width = Math.min(Math.max(finite(b.width) ? b.width : 395, min.width), area.width);
  const height = Math.min(Math.max(finite(b.height) ? b.height : 810, min.height), area.height);
  const x = Math.min(Math.max(finite(b.x) ? b.x : area.x + area.width - width - 10, area.x), area.x + area.width - Math.min(width, 80));
  const y = Math.min(Math.max(finite(b.y) ? b.y : area.y + 60, area.y), area.y + area.height - Math.min(height, 80));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

const ACTIONS = new Set(['close', 'minimize', 'pin', 'dock', 'terminal', 'accent']);

module.exports = { normalize, pickTarget, placeBeside, clampBounds, ACTIONS, KIND_LABEL };
