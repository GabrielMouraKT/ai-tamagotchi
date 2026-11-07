'use strict';
// Botões da janela (só existem no Electron) e menu de terminal de destino.
(() => {
  const api = window.desktop, $ = id => document.getElementById(id);
  const buttons = ['dock', 'pin', 'minimize', 'close', 'termMenuBtn'];
  if (!api) { for (const k of buttons) { $(k).title = 'Disponível no aplicativo desktop (npm run desktop)'; $(k).disabled = true; } return; }

  const menu = $('termMenu');
  $('dock').addEventListener('click', () => api.action('dock'));
  $('pin').addEventListener('click', () => api.action('pin'));
  $('minimize').addEventListener('click', () => api.action('minimize'));
  $('close').addEventListener('click', () => api.action('close'));
  $('termMenuBtn').addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; $('termMenuBtn').setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('button')?.focus(); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; $('termMenuBtn').setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; $('termMenuBtn').focus(); } });

  function item(text, sub, selected, onPick) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(selected));
    const t = document.createElement('span'); t.textContent = (selected ? '● ' : '○ ') + text; b.append(t);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
    b.addEventListener('click', () => { onPick(); menu.hidden = true; $('termMenuBtn').setAttribute('aria-expanded', 'false'); });
    return b;
  }

  const render = s => {
    if (!s) return;
    $('dock').classList.toggle('active', s.docked); $('dock').setAttribute('aria-pressed', String(s.docked));
    $('pin').classList.toggle('active', s.pinned); $('pin').setAttribute('aria-pressed', String(s.pinned));
    $('dock').title = s.docked ? 'Desgrudar do terminal' : 'Grudar ao terminal';
    $('pin').title = s.pinned ? 'Sempre à frente: ligado' : 'Sempre à frente: desligado';
    let hint;
    if (s.helper.ok === false) hint = 'Acoplar indisponível: ' + (s.helper.error || 'helper não iniciou');
    else if (s.docked) hint = s.targetKey ? `Grudado ao terminal (${s.side === 'left' ? 'esquerda' : s.side === 'right' ? 'direita' : 'borda da tela'}) · ⧉ solta` : 'Grudar ativado · nenhum terminal aberto';
    else hint = 'Arraste pelo topo para mover';
    $('anchorHint').textContent = hint;

    menu.replaceChildren();
    const auto = s.mode === 'auto';
    menu.append(item('Terminal em foco agora', 'ao grudar, fica preso ao terminal escolhido', auto, () => api.action('terminal', null)));
    if (!s.terminals.length) { const p = document.createElement('p'); p.textContent = 'Nenhum Windows Terminal/PowerShell/CMD aberto.'; menu.append(p); }
    for (const t of s.terminals) menu.append(item(t.label + (t.foreground ? ' (em foco)' : ''), t.title, !auto && t.key === s.targetKey, () => api.action('terminal', t.key)));
  };
  api.onState(render);
  api.getState().then(render); // estado inicial (o push do main pode chegar antes deste script)
})();
