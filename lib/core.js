'use strict';
// Núcleo puro (sem fs, sem DOM): usado pelo statusline, pelo painel no navegador e pelos testes.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TamaCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const num = n => typeof n === 'number' && Number.isFinite(n);
  const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
  const pctOrNull = v => (num(v) ? clamp(v) : null);
  const round6 = n => Math.round(n * 1e6) / 1e6;
  const ACTIVE_SEC = 300;           // sessão "ativa" se houve evento nos últimos 5 min
  const MAX_AGE_MS = 7 * 86400e3;   // sessões mais antigas que 7 dias são ignoradas

  // resets_at é documentado como Unix epoch em SEGUNDOS. Aceita ms/ISO por tolerância; nunca inventa.
  function toEpochSeconds(v) {
    if (num(v)) { if (v <= 0) return null; return v > 1e11 ? Math.round(v / 1000) : v; }
    if (typeof v === 'string' && v.trim()) { const t = Date.parse(v); return Number.isNaN(t) ? null : Math.floor(t / 1000); }
    return null;
  }

  function parseWindow(w) {
    if (!w || typeof w !== 'object') return null;
    const usedPct = pctOrNull(w.used_percentage), resetsAt = toEpochSeconds(w.resets_at);
    return usedPct === null && resetsAt === null ? null : { usedPct, resetsAt };
  }

  // Entrada bruta do Claude Code -> snapshot normalizado. Campos ausentes viram null.
  function parseStatus(input, nowMs) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const c = input.context_window && typeof input.context_window === 'object' ? input.context_window : {};
    const used = pctOrNull(c.used_percentage);
    const remaining = pctOrNull(c.remaining_percentage) ?? (used === null ? null : 100 - used);
    const rl = input.rate_limits && typeof input.rate_limits === 'object' ? input.rate_limits : {};
    const five = parseWindow(rl.five_hour), seven = parseWindow(rl.seven_day);
    const m = input.model && typeof input.model === 'object' ? input.model : {};
    const modelName = String(m.display_name || m.id || '').trim() || null;
    const cost = num(input.cost?.total_cost_usd) ? Math.max(0, input.cost.total_cost_usd) : null;
    const win = pos => (num(pos) && pos > 0 ? pos : null);
    return {
      sessionId: String(input.session_id ?? '').trim() || 'unknown',
      observedAt: num(nowMs) ? nowMs : Date.now(),
      model: modelName, modelId: m.id ? String(m.id) : null,
      context: {
        usedPct: used === null && remaining !== null ? 100 - remaining : used, remainingPct: remaining,
        windowSize: win(c.context_window_size), totalInput: num(c.total_input_tokens) ? c.total_input_tokens : null,
        totalOutput: num(c.total_output_tokens) ? c.total_output_tokens : null,
      },
      limits: { fiveHour: five, sevenDay: seven }, hasRateLimits: !!(five || seven), costUsd: cost,
    };
  }

  // Atualiza o registro persistido de UMA sessão. Custo é cumulativo por sessão: só o delta é atribuído ao modelo.
  function updateSessionRecord(prev, snap) {
    const same = prev && typeof prev === 'object' && prev.sessionId === snap.sessionId;
    const p = same ? prev : null;
    const rec = {
      v: 1, sessionId: snap.sessionId, firstSeen: p?.firstSeen ?? snap.observedAt, observedAt: snap.observedAt,
      model: snap.model ?? p?.model ?? null, modelId: snap.modelId ?? p?.modelId ?? null,
      context: snap.context, limits: {}, costUsd: p?.costUsd ?? null,
      perModel: { ...(p?.perModel || {}) }, costResets: p?.costResets ?? 0,
    };
    // Limites são da conta, não da sessão. Se uma janela sumiu do evento, só mantém a anterior se ainda não renovou.
    const nowSec = snap.observedAt / 1000;
    for (const k of ['fiveHour', 'sevenDay']) {
      const cur = snap.limits[k], old = p?.limits?.[k];
      if (cur) rec.limits[k] = { ...cur, seenAt: snap.observedAt };
      else if (old && !(num(old.resetsAt) && old.resetsAt <= nowSec)) rec.limits[k] = old;
      else rec.limits[k] = null;
    }
    if (snap.costUsd !== null) {
      const last = num(p?.costUsd) ? p.costUsd : 0;
      let delta;
      if (snap.costUsd >= last) delta = snap.costUsd - last;
      else { delta = snap.costUsd; rec.costResets += 1; } // contador voltou (ex.: /clear): recomeça do novo valor
      if (delta > 0) { const key = rec.model || 'Indisponível'; rec.perModel[key] = round6((rec.perModel[key] || 0) + delta); }
      rec.costUsd = snap.costUsd;
    }
    // costResets: após /clear o total acumulado da sessão continua em perModel; costUsd mostra só o contador atual.
    return rec;
  }

  // Limite efetivo no instante `nowSec`. Só mostra ETA se resets_at foi informado.
  function effectiveLimit(l, nowSec) {
    const none = { status: 'unavailable', usedPct: null, remainingPct: null, resetsAt: l?.resetsAt ?? null, etaSec: null, seenAt: l?.seenAt ?? null };
    if (!l || !num(l.usedPct)) return none;
    if (num(l.resetsAt) && l.resetsAt <= nowSec) return { ...none, status: 'renewed' }; // dado vencido: não finge saber o novo valor
    const remainingPct = clamp(100 - l.usedPct);
    return {
      status: remainingPct <= 0 ? 'exhausted' : 'ok', usedPct: l.usedPct, remainingPct, resetsAt: l.resetsAt ?? null,
      etaSec: num(l.resetsAt) ? Math.max(0, Math.ceil(l.resetsAt - nowSec)) : null, seenAt: l.seenAt ?? null,
    };
  }

  // Humor: sono só por quota conhecida em 0%; contexto cheio nunca dorme. Limites ausentes não contam.
  function computeMood(ctxRemaining, fiveRemaining, weekRemaining) {
    if ((num(fiveRemaining) && fiveRemaining <= 0) || (num(weekRemaining) && weekRemaining <= 0)) return 'sleeping';
    const values = [ctxRemaining, fiveRemaining, weekRemaining].filter(num);
    if (!values.length) return 'unknown';
    const r = Math.round(Math.min(...values)); // mesmo arredondamento que o usuário vê
    if (r > 50) return 'happy';
    if (r >= 30) return 'sad';
    return 'worried'; // 0–29% (inclui contexto 0%)
  }

  const freshest = (sessions, key) => sessions
    .filter(s => s.limits?.[key] && num(s.limits[key].usedPct))
    .sort((a, b) => (b.limits[key].seenAt ?? b.observedAt) - (a.limits[key].seenAt ?? a.observedAt))[0]?.limits[key] ?? null;

  // View completa para a UI. `sessions` = registros persistidos. Nada é somado em duplicidade:
  // cada sessão contribui UMA vez com seu perModel (deltas já deduplicados na gravação).
  function buildView(sessions, opts = {}) {
    const nowMs = num(opts.now) ? opts.now : Date.now(), nowSec = nowMs / 1000;
    const list = (Array.isArray(sessions) ? sessions : [])
      .filter(s => s && typeof s.sessionId === 'string' && num(s.observedAt) && nowMs - s.observedAt <= MAX_AGE_MS)
      .sort((a, b) => b.observedAt - a.observedAt);
    const summaries = list.map(s => ({
      id: s.sessionId, shortId: s.sessionId.length > 8 ? s.sessionId.slice(0, 8) : s.sessionId, model: s.model,
      observedAt: s.observedAt, ageSec: Math.max(0, Math.round((nowMs - s.observedAt) / 1000)),
      active: nowMs - s.observedAt <= ACTIVE_SEC * 1000, costUsd: s.costUsd ?? null,
    }));
    const selected = list.find(s => s.sessionId === opts.sessionId) || list[0] || null;
    const five = effectiveLimit(freshest(list, 'fiveHour'), nowSec), seven = effectiveLimit(freshest(list, 'sevenDay'), nowSec);
    const perModel = {}; let total = 0;
    for (const s of list) for (const [k, v] of Object.entries(s.perModel || {})) if (num(v)) { perModel[k] = round6((perModel[k] || 0) + v); total += v; }
    const ctxRemaining = selected?.context?.remainingPct ?? null;
    const w = selected?.context?.windowSize ?? null;
    const freeTokens = num(w) && num(ctxRemaining) ? Math.round(w * ctxRemaining / 100) : null; // estimado a partir do %
    return {
      now: nowMs, sessions: summaries, selectedId: selected?.sessionId ?? null, autoSelected: selected ? selected.sessionId !== opts.sessionId : false,
      selected: selected && {
        id: selected.sessionId, model: selected.model, costUsd: selected.costUsd ?? null, perModel: selected.perModel || {},
        observedAt: selected.observedAt, ageSec: Math.max(0, Math.round((nowMs - selected.observedAt) / 1000)),
        context: { ...selected.context, freeTokens },
      },
      limits: { fiveHour: five, sevenDay: seven, accountHasRateLimits: !!(five.usedPct !== null || seven.usedPct !== null || five.status === 'renewed' || seven.status === 'renewed') },
      aggregate: { sessionCount: list.length, activeCount: summaries.filter(s => s.active).length, totalUsd: round6(total), perModel },
      mood: computeMood(ctxRemaining, five.remainingPct, seven.remainingPct),
      blocked: five.status === 'exhausted' || seven.status === 'exhausted',
    };
  }

  function formatDuration(sec) {
    if (!num(sec)) return null;
    const s = Math.max(0, Math.floor(sec)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    const p = n => String(n).padStart(2, '0');
    return `${d ? d + 'd ' : ''}${p(h)}:${p(m)}:${p(ss)}`;
  }
  // Instante absoluto em fuso explícito (testável) ou no fuso do sistema.
  function formatInstant(epochSec, timeZone) {
    if (!num(epochSec)) return null;
    const o = { dateStyle: 'short', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) };
    return new Intl.DateTimeFormat('pt-BR', o).format(new Date(epochSec * 1000));
  }
  function describeReset(limit, timeZone) {
    if (!limit || limit.status === 'unavailable') return 'Indisponível (Claude Code não informou)';
    if (limit.status === 'renewed') return 'Janela renovada · aguardando novo dado do Claude Code';
    if (!num(limit.etaSec)) return 'Reset indisponível (horário não informado)';
    return `Reinicia em ${formatDuration(limit.etaSec)} · ${formatInstant(limit.resetsAt, timeZone)}`;
  }

  return { num, clamp, toEpochSeconds, parseStatus, updateSessionRecord, effectiveLimit, computeMood, buildView, formatDuration, formatInstant, describeReset, ACTIVE_SEC, MAX_AGE_MS };
});
