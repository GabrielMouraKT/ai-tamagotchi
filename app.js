'use strict';
const $ = id => document.getElementById(id);
const C = window.TamaCore, A = window.TamaAnim;

/* ---------- Preferências (localStorage pode falhar: nunca quebra a UI) ---------- */
const pref = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- Formatação ---------- */
const pct = n => (!C.num(n) ? '—' : n > 0 && n < 1 ? '<1%' : Math.round(n) + '%');
const money = n => (C.num(n) ? '$' + n.toFixed(n < 1 ? 3 : 2) : '—');
const tokens = n => (C.num(n) ? Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : '—');
const ago = s => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`);
const level = r => (!C.num(r) ? 'none' : r <= 0 ? 'empty' : r < 30 ? 'worried' : r <= 50 ? 'sad' : 'ok');
const levelWord = { none: 'indisponível', empty: 'esgotado', worried: 'crítico', sad: 'atenção', ok: 'ok' };
const hexRGB = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
const shortDur = sec => { if (!C.num(sec)) return null; const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`; };

/* ---------- Estado ---------- */
let mascots = [], byId = {};
let petId = pref.get('ai-pet', 'fox'), pendingPet = petId;
let sessionPref = pref.get('ai-session', 'auto');
let payload = null, serverDown = false, prevBlocked = false, demoSwitch = false, currentMood = 'unknown', lastView = null;
let demoOn = false, demoLevel = 72;
let wakeUntil = 0, actionName = null, actionUntil = 0, blinkUntil = 0, nextBlink = Date.now() + 5000;
// Reduzir animações é escolha do usuário (padrão: animado). A preferência de movimento do sistema só desliga efeitos CSS (brilhos).
const calm = () => document.body.classList.contains('calm');

/* ---------- Animação quadro a quadro (PNG em mascotes/<id>/animacoes/<estado>/) ---------- */
const petImg = $('petImage');
const preloaded = new Set();
let animState = null, animIndex = 0, animTimer = null, framesBroken = false;

function preload(id, state) {
  const key = id + '/' + state; if (preloaded.has(key)) return; preloaded.add(key);
  for (let i = 0; i < A.COUNTS[state]; i++) { const im = new Image(); im.src = A.framePath(id, state, i); }
}
petImg.addEventListener('error', () => { // quadro ausente: cai para a arte estática e para de animar este mascote
  if (!framesBroken && byId[petId]) { framesBroken = true; petImg.src = byId[petId].src; }
});
const showFrame = (state, i) => { if (!framesBroken) petImg.src = A.framePath(petId, state, i); };
function setAnimState(state) {
  if (state === animState) return;
  animState = state; animIndex = 0; preload(petId, state);
  petImg.alt = `Mascote ${byId[petId]?.name || ''}: animação ${state.replace('_', ' ')}`;
}
function animTick() {
  clearTimeout(animTimer);
  if (document.hidden || calm()) { animTimer = setTimeout(animTick, 500); return; }
  const now = Date.now();
  if (now >= nextBlink && (currentMood === 'happy' || currentMood === 'unknown')) { blinkUntil = now + A.durationMs('piscar'); nextBlink = now + 5000 + Math.random() * 4000; }
  setAnimState(A.chooseState({ mood: currentMood, nowMs: now, wakeUntil, actionName, actionUntil, blinkUntil }));
  showFrame(animState, animIndex++);
  if (animIndex >= A.COUNTS[animState]) animIndex = 0;
  if (actionName && now >= actionUntil) { actionName = null; $('feedPet').disabled = false; }
  animTimer = setTimeout(animTick, A.frameMs(animState));
}
function syncStatic() { // modo "reduzir animações": um quadro fixo por estado
  if (!calm()) return;
  const st = wakeUntil > Date.now() ? 'despertar' : A.baseState(currentMood);
  setAnimState(st); showFrame(st, 0);
}
function feed() { // cosmético: não toca em telemetria nem consome tokens
  if (actionName) return;
  actionName = 'comer_tokens'; actionUntil = Date.now() + A.durationMs('comer_tokens'); $('feedPet').disabled = true;
  if (calm()) { setAnimState('comer_tokens'); showFrame('comer_tokens', 4); setTimeout(() => { actionName = null; $('feedPet').disabled = false; syncStatic(); }, 1200); }
}
$('feedPet').addEventListener('click', feed);

/* ---------- Mascote ---------- */
function changePet(id) {
  if (!byId[id]) return;
  petId = id; pref.set('ai-pet', id); framesBroken = false; animState = null; preloaded.clear();
  const m = byId[id], root = document.documentElement.style;
  root.setProperty('--accent', m.color || '#ff922d'); root.setProperty('--pet-bg', m.background || '#48200f');
  root.setProperty('--theme-rgb', hexRGB(m.color || '#ff922d'));
  // Texto do botão: branco se houver contraste WCAG >= 3:1 (texto grande/negrito) sobre o tom escuro do degradê; senão escuro.
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexRGB(m.color || '#ff922d').split(',').map(n => Number(n) * 0.78);
  const light = 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05) < 3;
  root.setProperty('--cta-ink', light ? '#1b0f12' : '#ffffff'); root.setProperty('--cta-shadow', light ? 'none' : '0 1px 2px #0005');
  petImg.src = m.src; $('petName').textContent = m.name; $('selectedMascot').textContent = m.name;
  window.desktop?.action('accent', m.color); // borda nativa da janela na cor do mascote (Electron/Windows 11)
  const em = $('openGallery').querySelector('.sel-line span'); if (em) em.textContent = m.emoji || '🐾';
  preload(id, 'idle'); setAnimState(A.baseState(currentMood)); syncStatic();
}

/* ---------- Galeria paginada (sem rolagem; só altera o mascote, nunca a telemetria) ---------- */
const dialog = $('galleryDialog'), grid = $('mascotGrid');
let page = 0;
const pageSize = () => (window.innerHeight < 560 ? 3 : window.innerHeight < 700 ? 6 : 9);
function renderGallery() {
  const term = $('mascotSearch').value.trim().toLocaleLowerCase('pt-BR');
  const matches = mascots.filter(m => (m.name + ' ' + m.description).toLocaleLowerCase('pt-BR').includes(term));
  const size = pageSize(), pages = Math.max(1, Math.ceil(matches.length / size));
  page = Math.min(page, pages - 1);
  grid.replaceChildren();
  for (const m of matches.slice(page * size, page * size + size)) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mascot-choice' + (pendingPet === m.id ? ' active' : '');
    btn.setAttribute('aria-pressed', String(pendingPet === m.id)); btn.title = m.description;
    const img = document.createElement('img'); img.src = m.src; img.alt = '';
    const t = document.createElement('strong'); t.textContent = m.name;
    const d = document.createElement('small'); d.textContent = m.description;
    btn.append(img, t, d);
    btn.addEventListener('click', () => { pendingPet = m.id; renderGallery(); });
    grid.append(btn);
  }
  $('galleryEmpty').hidden = matches.length > 0;
  $('galleryCount').textContent = `${matches.length} de ${mascots.length} · pág. ${page + 1}/${pages}`;
  $('pagePrev').disabled = page === 0; $('pageNext').disabled = page >= pages - 1;
  $('previewName').textContent = byId[pendingPet] ? byId[pendingPet].name + (pendingPet === petId ? ' (atual)' : '') : '—';
}
function openGallery() { pendingPet = petId; page = Math.max(0, Math.floor(mascots.findIndex(m => m.id === petId) / pageSize())); $('mascotSearch').value = ''; renderGallery(); dialog.showModal(); }
$('openGallery').addEventListener('click', openGallery);
$('openGalleryBottom').addEventListener('click', openGallery);
$('closeGallery').addEventListener('click', () => dialog.close());
$('mascotSearch').addEventListener('input', () => { page = 0; renderGallery(); });
$('pagePrev').addEventListener('click', () => { page--; renderGallery(); });
$('pageNext').addEventListener('click', () => { page++; renderGallery(); });
$('applyMascot').addEventListener('click', () => { changePet(pendingPet); dialog.close(); });
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

/* ---------- Painel de detalhes (cards viram botões) ---------- */
const sheet = $('sheet'), sheetBody = $('sheetBody');
let sheetKind = null;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const kv = (k, v) => { const r = el('div', 'kv'); r.append(el('span', '', k), el('b', '', v)); return r; };
const note = text => el('p', 'note', text);
function bigMeter(remaining, word) {
  const box = el('div'), big = el('div', 'big', C.num(remaining) ? pct(remaining) : '—');
  big.append(el('small', '', C.num(remaining) ? ` livres · ${word}` : ' · indisponível'));
  const track = el('span', 'track'), i = el('i'); i.className = 'lvl-' + level(remaining); i.style.width = C.num(remaining) ? C.clamp(remaining) + '%' : '0%'; track.append(i);
  box.append(big, track); return box;
}
function limitSheet(l, name) {
  const out = [bigMeter(l.remainingPct, levelWord[level(l.remainingPct)])];
  if (l.status === 'unavailable') out.push(note(lastView.limits.accountHasRateLimits ? 'Esta janela não foi informada pelo Claude Code.' : 'Indisponível: este plano/sessão não informa limites (só planos Pro/Max, e só depois da primeira resposta). Nada é estimado.'));
  else if (l.status === 'renewed') out.push(note('A janela foi renovada. Aguardando um novo dado do Claude Code (nenhum percentual é inventado).'));
  else {
    out.push(kv('Usado', pct(l.usedPct)));
    if (C.num(l.etaSec)) { out.push(kv('Reinicia em', C.formatDuration(l.etaSec))); out.push(kv('Horário local', C.formatInstant(l.resetsAt))); out.push(kv('UTC', C.formatInstant(l.resetsAt, 'UTC'))); }
    else out.push(note('Reset indisponível: o Claude Code não informou o horário. Nenhuma hora de retorno é estimada.'));
    if (C.num(l.seenAt)) out.push(kv('Dado observado há', ago(Math.max(0, Math.round((Date.now() - l.seenAt) / 1000)))));
  }
  out.push(note(`${name}: quota da conta (vale o evento mais recente entre todas as sessões). Quota esgotada faz o mascote dormir.`));
  return out;
}
const SHEETS = {
  ctx: v => { const s = v.selected, c = s?.context || {}; const rem = c.remainingPct ?? null;
    const out = [bigMeter(rem, levelWord[level(rem)])];
    if (s) { out.push(kv('Tokens livres (est.)', C.num(c.freeTokens) ? '≈ ' + tokens(c.freeTokens) : '—')); out.push(kv('Janela de contexto', tokens(c.windowSize))); out.push(kv('Entrada / saída', `${tokens(c.totalInput)} / ${tokens(c.totalOutput)}`)); }
    out.push(note('Contexto cheio NÃO é limite de quota: use /compact ou comece outra conversa. O mascote só dorme quando a quota de 5 h ou 7 dias esgota.')); return out; },
  five: v => limitSheet(v.limits.fiveHour, 'Janela de 5 horas'),
  week: v => limitSheet(v.limits.sevenDay, 'Limite de 7 dias'),
  model: v => { const s = v.selected; return s ? [kv('Modelo', s.model || '—'), kv('Sessão', s.id.slice(0, 8)), kv('Evento há', ago(s.ageSec)), note('Vem do JSON da statusLine do Claude Code.')] : [note('Sem sessão ativa.')]; },
  cost: v => { const s = v.selected; if (!s) return [note('Sem sessão ativa.')];
    const out = [kv('Custo estimado da sessão', money(s.costUsd))];
    for (const [k, x] of Object.entries(s.perModel || {}).sort((a, b) => b[1] - a[1])) out.push(kv(k, money(x)));
    out.push(note('Valor ESTIMADO pelo Claude Code (preço de lista da API). Não é fatura nem cobrança adicional da assinatura. Por modelo é aproximado (diferença entre custos acumulados).')); return out; },
  tokens: v => { const s = v.selected; return s ? [kv('Entrada (contexto atual)', tokens(s.context.totalInput)), kv('Saída (contexto atual)', tokens(s.context.totalOutput)), kv('Livres no contexto (est.)', C.num(s.context.freeTokens) ? '≈ ' + tokens(s.context.freeTokens) : '—'), note('Contadores do contexto atual, não a soma histórica.')] : [note('Sem sessão ativa.')]; },
  total: v => { const a = v.aggregate; const out = [kv('Total estimado', money(a.totalUsd)), kv('Sessões', `${a.sessionCount} (${a.activeCount} ativas)`)];
    for (const [k, x] of Object.entries(a.perModel).sort((p, q) => q[1] - p[1])) out.push(kv(k, money(x)));
    out.push(note('Soma ESTIMADA de todas as sessões locais, cada uma contada uma vez. Não é a conta real nem cobrança adicional; a quota 5 h/7 d vem do Claude Code.')); return out; },
  privacy: () => { const row = (mark, text) => { const r = el('div', 'kv'); r.append(el('span', '', mark), el('b', '', text)); r.style.justifyContent = 'flex-start'; r.style.gap = '8px'; r.lastChild.style.textAlign = 'left'; r.lastChild.style.fontWeight = '500'; return r; };
    return [note('O app usa somente o necessário para o mascote funcionar. Nada do que você faz é capturado ou enviado.'),
      el('p', 'note', 'USA (só neste computador):'),
      row('✔', 'Do Claude Code: nome do modelo, % do contexto, % e horário de reset das janelas de 5 h e 7 dias (quando informados), custo estimado e o identificador da sessão.'),
      row('✔', 'Das janelas de terminal abertas: posição, tamanho e título, só para grudar o mascote ao lado. Não são salvos nem enviados.'),
      row('✔', 'Suas escolhas: mascote, posição e tamanho da janela.'),
      el('p', 'note', 'NÃO FAZ:'),
      row('✘', 'Não lê suas conversas, comandos, código, arquivos, senhas, tokens nem dados da sua conta do Claude. Não pede login.'),
      row('✘', 'Não lê o conteúdo do terminal.'),
      row('✘', 'Não envia nada pela internet: sem telemetria, sem cadastro, sem anúncios. O painel só conversa com o próprio app (127.0.0.1).'),
      note('Os dados ficam em arquivos pequenos na pasta .claude/ai-tamagotchi do seu usuário. Você pode apagar essa pasta quando quiser.')]; },
  connect: () => { const out = [note('Para o mascote receber os dados reais, o Claude Code precisa enviar o status para este app. Isso adiciona somente a chave "statusLine" no arquivo de configurações do Claude Code (~/.claude/settings.json), depois de fazer um backup dele. Se você já usa outra linha de status, ela NÃO é substituída.'), note('Privacidade: só os números do status (modelo, %, custo estimado) chegam ao app, neste computador. Não lê conversas, código, senhas nem tokens, não pede login e não envia nada pela internet.')];
    const result = el('p', 'note'); result.setAttribute('role', 'status');
    const MSG = { installed: 'Pronto! Abra uma NOVA sessão do Claude Code para os dados aparecerem aqui. (Backup do arquivo salvo ao lado dele.)', already: 'Já estava conectado.', none: 'Não havia nada para remover.', removed: 'Desconectado. A sua configuração anterior foi preservada (backup salvo).',
      'exists-different': 'Você já usa outra linha de status no Claude Code. Não mexi nela. (Para usar as duas, peça ajuda para combinar os comandos.)', 'not-ours': 'A linha de status atual não é deste app; não removi.', 'invalid-json': 'O arquivo de configurações do Claude Code não é um JSON válido; não alterei nada.', 'read-error': 'Não consegui ler o arquivo de configurações do Claude Code.', 'write-error': 'Não consegui gravar o arquivo de configurações do Claude Code.' };
    const act = (label, mode) => { const b = el('button', 'opt'); b.type = 'button'; const d = el('div'); d.append(el('b', '', label)); b.append(d);
      b.addEventListener('click', async () => { b.disabled = true; try { const r = await window.desktop.connect(mode); result.textContent = r ? (MSG[r.status] || r.status) : 'Indisponível.'; } catch { result.textContent = 'Não foi possível concluir.'; } b.disabled = false; }); return b; };
    if (window.desktop?.connect) out.push(act('Conectar ao Claude Code', 'install'), act('Desconectar (remover só a statusLine do app)', 'remove')); else out.push(note('Disponível no aplicativo desktop. Pelo terminal: node install-statusline.js'));
    out.push(result); return out; },
  reset: v => { const out = []; for (const [name, l] of [['Janela de 5 horas', v.limits.fiveHour], ['Limite de 7 dias', v.limits.sevenDay]]) {
      out.push(kv(name, C.num(l.etaSec) ? 'em ' + C.formatDuration(l.etaSec) : l.status === 'renewed' ? 'renovada' : 'indisponível'));
      if (C.num(l.resetsAt)) out.push(kv('  horário local', C.formatInstant(l.resetsAt))); }
    out.push(note('Só aparece quando o Claude Code informa o horário de reset (resets_at). Sem ele, nada é estimado.')); return out; },
  menu: v => { const mk = (label, sub, kind) => { const b = el('button', 'opt'); b.type = 'button'; const d = el('div'); d.append(el('b', '', label)); d.append(el('small', '', sub)); b.append(d); b.addEventListener('click', () => openSheet(kind)); return b; };
    return [mk('Sessões do Claude Code', `${v.sessions.length} encontrada(s) · escolher qual exibir`, 'sessions'), mk('Modelo', v.selected?.model || 'indisponível', 'model'), mk('Custo estimado da sessão', money(v.selected?.costUsd), 'cost'),
      mk('Tokens', v.selected ? `${tokens(v.selected.context.totalInput)} entrada / ${tokens(v.selected.context.totalOutput)} saída` : '—', 'tokens'), mk('Total estimado (todas as sessões)', money(v.aggregate.totalUsd), 'total'),
      mk('Próximos resets', 'contagem das janelas de 5 h e 7 dias', 'reset'), mk('Conectar ao Claude Code', 'liga os dados reais (uma vez só)', 'connect'), mk('Privacidade', 'o que o app usa e o que nunca faz', 'privacy'), mk('Preferências', 'animações, demonstração', 'prefs')]; },
  sessions: v => { const out = []; const mk = (id, title, sub, on) => { const b = el('button', 'opt'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on));
      b.append(el('span', '', on ? '●' : '○')); const d = el('div'); d.append(el('b', '', title)); d.append(el('small', '', sub)); b.append(d);
      b.addEventListener('click', () => { sessionPref = id; pref.set('ai-session', id); render(); openSheet('sessions'); }); return b; };
    out.push(mk('auto', 'Automática', 'sempre a sessão mais recente', sessionPref === 'auto' || !v.sessions.some(s => s.id === sessionPref)));
    for (const s of v.sessions) out.push(mk(s.id, `${s.model || 'modelo n/d'} · #${s.shortId}`, `${s.active ? 'ativa' : 'ociosa'} · evento há ${ago(s.ageSec)}`, sessionPref === s.id));
    if (!v.sessions.length) out.push(note('Nenhuma sessão ainda. Abra o Claude Code (uma sessão iniciada após a instalação da statusLine).')); return out; },
  prefs: () => { const mk = (label, sub, on, fn) => { const l = el('label', 'opt'); const i = el('input'); i.type = 'checkbox'; i.checked = on; i.addEventListener('change', () => fn(i.checked)); const d = el('div'); d.append(el('b', '', label)); d.append(el('small', '', sub)); l.append(i, d); return l; };
    const out = [mk('Reduzir animações', 'um quadro fixo por estado', pref.get('ai-calm', '0') === '1', on => { pref.set('ai-calm', on ? '1' : '0'); applyPrefs(); }),
      mk('Demonstração', 'valores FICTÍCIOS para ver as emoções', demoOn, on => { demoOn = on; demoSwitch = true; render(); openSheet('prefs'); })];
    if (demoOn) { const r = el('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = demoLevel; r.setAttribute('aria-label', 'Percentual livre simulado'); r.addEventListener('input', () => { demoLevel = Number(r.value); render(); }); out.push(r); }
    out.push(note('Redimensione a janela pela borda: o mascote acompanha o tamanho. ⧉ cola ao terminal; ▾ escolhe qual terminal. Dados reais nunca são substituídos por inventados.')); return out; },
};
const TITLES = { privacy: 'Privacidade', connect: 'Conectar ao Claude Code', menu: 'Menu', reset: 'Próximos resets', ctx: 'Contexto da conversa', five: 'Janela de 5 horas', week: 'Limite de 7 dias', model: 'Modelo', cost: 'Custo da sessão (estimado)', tokens: 'Tokens', total: 'Total estimado', sessions: 'Sessões do Claude Code', prefs: 'Preferências' };
const LIVE = new Set(['ctx', 'five', 'week', 'model', 'cost', 'tokens', 'total', 'reset']);
function fillSheet() { if (!sheetKind || !lastView) return; $('sheetTitle').textContent = TITLES[sheetKind]; sheetBody.replaceChildren(...SHEETS[sheetKind](lastView)); }
function openSheet(kind) { sheetKind = kind; fillSheet(); if (!sheet.open) sheet.showModal(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if (b) openSheet(b.dataset.sheet); });
$('sheetClose').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
sheet.addEventListener('close', () => { sheetKind = null; });

/* ---------- Preferências de UI ---------- */
function applyPrefs() { document.body.classList.toggle('calm', pref.get('ai-calm', '0') === '1'); syncStatic(); }

/* ---------- Cards ---------- */
function setCard(prefix, cardId, remaining, sub) {
  const lv = level(remaining), card = $(cardId), bar = $(prefix + 'Bar'), track = bar.parentElement;
  card.dataset.level = lv;
  bar.style.width = C.num(remaining) ? C.clamp(remaining) + '%' : '0%'; bar.className = 'lvl-' + lv;
  if (C.num(remaining)) track.setAttribute('aria-valuenow', String(Math.round(remaining))); else track.removeAttribute('aria-valuenow');
  $(prefix + 'Text').textContent = C.num(remaining) ? pct(remaining) : '—';
  $(prefix + 'Sub').textContent = sub;
  const name = { ctx: 'Contexto', five: 'Janela de 5 horas', week: 'Limite de 7 dias' }[prefix];
  card.setAttribute('aria-label', `${name}: ${C.num(remaining) ? pct(remaining) + ' livres, ' + levelWord[lv] : 'indisponível'}. ${sub}. Abrir detalhes.`);
}
const limitSub = l => (l.status === 'unavailable' ? 'indisponível' : l.status === 'renewed' ? 'renovada' : C.num(l.etaSec) ? 'reinicia ' + shortDur(l.etaSec) : 'reset indisponível');

/* ---------- Demonstração (sempre rotulada como fictícia; nunca no modo real) ---------- */
function demoView() {
  const L = demoLevel, now = Date.now();
  const rec = { sessionId: 'demo', observedAt: now, model: 'Modelo demo', context: { remainingPct: L, usedPct: 100 - L, windowSize: 200000, totalInput: 40000, totalOutput: 3000 },
    limits: { fiveHour: { usedPct: 100 - L, resetsAt: null, seenAt: now }, sevenDay: { usedPct: 38, resetsAt: null, seenAt: now } }, costUsd: 0.218, perModel: { 'Modelo demo': 0.218 } };
  return C.buildView([rec], { now, sessionId: 'demo' });
}

const PILL = { happy: '😊 Feliz', sad: '😢 Triste', worried: '😟 Preocupado', sleeping: '😴 Dormindo', unknown: '◌ Aguardando' };
const EMOTE = { happy: '♥', sad: '💧', worried: '❗', sleeping: '', unknown: '?' };
// Abas de humor: clique mostra uma PRÉVIA da animação por 6 s (cosmético; não altera nenhum número de telemetria).
let previewMood = null, previewUntil = 0;
document.querySelectorAll('.moodtabs button').forEach(b => b.addEventListener('click', () => { previewMood = b.dataset.mood; previewUntil = Date.now() + 6000; render(); }));
const BUBBLE = { happy: 'Bora codar? Estou aqui com você!', sad: 'Vamos com calma…', worried: 'Estamos perto do limite!', sleeping: 'Zzz… aguardando renovação', unknown: 'Aguardando Claude Code' };
const MOOD = { happy: 'Feliz! Ainda temos energia!', sad: 'Hmm... melhor economizar.', worried: 'Socorro! Quase no limite!', sleeping: 'Zzz... quota esgotada, aguardando o reset', unknown: 'Aguardando informações do Claude' };

/* ---------- Render ---------- */
function render() {
  const view = demoOn ? demoView() : C.buildView(payload?.sessions || [], { now: Date.now(), sessionId: sessionPref === 'auto' ? null : sessionPref });
  lastView = view;
  const sel = view.selected, five = view.limits.fiveHour, week = view.limits.sevenDay, ctxRem = sel?.context?.remainingPct ?? null;
  const now = Date.now();

  // Despertar ao sair de quota comprovadamente esgotada (reset passou ou novo dado).
  if (prevBlocked && !view.blocked && !demoSwitch) wakeUntil = now + A.durationMs('despertar');
  demoSwitch = false; prevBlocked = view.blocked;
  const previewing = previewMood && previewUntil > now; if (!previewing) previewMood = null;
  const shown = previewing ? previewMood : view.mood;     // o que o mascote MOSTRA (a prévia não muda os números)
  currentMood = shown;
  const waking = wakeUntil > now && !previewing;
  $('pet').className = 'pet ' + shown + (waking ? ' waking' : '');
  syncStatic();

  const quotaLow = [five.remainingPct, week.remainingPct].some(v => C.num(v) && v < 30);
  const ctxOnly = !previewing && C.num(ctxRem) && ctxRem < 30 && !quotaLow;
  const pill = $('moodPill'); pill.textContent = waking ? '☀ Acordando' : PILL[shown] + (previewing ? ' (prévia)' : ''); pill.dataset.mood = waking ? 'happy' : shown; pill.dataset.preview = String(!!previewing);
  $('bubble').textContent = waking ? 'Bom dia! Quota renovada.' : ctxOnly ? 'Contexto quase cheio: /compact ajuda.' : BUBBLE[shown];
  $('mood').textContent = waking ? 'Bom dia! A janela foi renovada.' : ctxOnly ? 'Contexto quase cheio (não é limite de quota).' : MOOD[shown];
  $('emote').textContent = waking ? '☀' : EMOTE[shown];
  document.querySelectorAll('.moodtabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mood === shown)));

  setCard('ctx', 'cardCtx', ctxRem, demoOn ? 'demonstração' : C.num(sel?.context?.freeTokens) ? '≈ ' + tokens(sel.context.freeTokens) + ' tokens' : 'não é quota');
  setCard('five', 'cardFive', five.remainingPct, demoOn ? 'demonstração' : limitSub(five));
  setCard('week', 'cardWeek', week.remainingPct, demoOn ? 'demonstração' : limitSub(week));

  $('model').textContent = sel?.model || '—';
  $('cost').textContent = money(sel?.costUsd);
  // Próximo reset = o mais próximo entre as janelas que o Claude Code informou. Sem resets_at: indisponível (nunca estimado).
  const cand = [['5 h', five], ['7 dias', week]].filter(([, l]) => C.num(l.etaSec)).sort((a, b) => a[1].etaSec - b[1].etaSec)[0];
  $('nextReset').textContent = demoOn ? 'demo' : cand ? C.formatDuration(cand[1].etaSec) : 'Indisponível';
  $('countdown').textContent = demoOn ? '—' : cand ? C.formatDuration(cand[1].etaSec) : 'Indisponível';
  $('countdownSub').textContent = demoOn ? 'não simulado' : cand ? `janela de ${cand[0]} · ${C.formatInstant(cand[1].resetsAt)}` : 'o Claude Code não informou o horário';
  $('weekUsed').textContent = C.num(week.usedPct) ? `${pct(week.usedPct)} usado` : 'Indisponível';
  $('weekUsedSub').textContent = C.num(week.remainingPct) ? `${pct(week.remainingPct)} livre · horas não informadas` : week.status === 'renewed' ? 'janela renovada' : 'sem dado de quota semanal';

  const age = sel?.ageSec ?? null, badge = $('connection');
  if (demoOn) { badge.textContent = 'DEMO'; badge.className = 'signal demo'; $('updated').textContent = 'Valores simulados (fictícios)'; }
  else if (serverDown) { badge.textContent = 'SERVIDOR OFF'; badge.className = 'signal'; $('updated').textContent = 'Não consegui falar com o servidor local'; }
  else if (!sel) { badge.textContent = 'SEM SESSÃO'; badge.className = 'signal'; $('updated').textContent = 'Use o Claude Code para gerar dados'; }
  else if (age < 120) { badge.textContent = 'AO VIVO'; badge.className = 'signal online'; $('updated').textContent = `Último evento há ${ago(age)} · ${view.sessions.length} sessão(ões)` + (payload?.errors?.length ? ` · ${payload.errors.length} arquivo(s) ilegível(is)` : ''); }
  else { badge.textContent = 'OCIOSO'; badge.className = 'signal'; $('updated').textContent = `Sem eventos há ${ago(age)} (últimos valores conhecidos)`; }

  if (sheet.open && LIVE.has(sheetKind)) fillSheet();
}

/* ---------- Rede (servidor local 127.0.0.1) ---------- */
async function fetchState() {
  if (document.hidden) return;
  try { const r = await fetch('/api/state', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); payload = await r.json(); serverDown = false; }
  catch { serverDown = true; }
  render();
}
async function loadCatalog() {
  try {
    const r = await fetch('mascots.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status);
    mascots = await r.json(); byId = Object.fromEntries(mascots.map(m => [m.id, m]));
  } catch { $('gallerySub').textContent = 'Não consegui carregar o catálogo de mascotes (mascots.json).'; return; }
  if (!byId[petId]) petId = byId.fox ? 'fox' : mascots[0].id;
  changePet(petId);
}

window.addEventListener('resize', () => { if (dialog.open) renderGallery(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { fetchState(); animTick(); } });
applyPrefs();
loadCatalog().then(() => { render(); animTick(); });
fetchState();
setInterval(fetchState, 3000);
setInterval(() => { if (!document.hidden) render(); }, 1000);
