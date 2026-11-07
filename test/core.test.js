'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../lib/core');

const NOW = Date.UTC(2026, 10, 7, 15, 0, 0); // 2026-11-07T15:00:00Z
const sec = NOW / 1000;
const input = (o = {}) => ({
  session_id: 's1', model: { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' },
  context_window: { used_percentage: 28, remaining_percentage: 72, context_window_size: 200000, total_input_tokens: 56000, total_output_tokens: 1200 },
  cost: { total_cost_usd: 0.12 },
  rate_limits: { five_hour: { used_percentage: 31, resets_at: sec + 3600 }, seven_day: { used_percentage: 44, resets_at: sec + 86400 } }, ...o,
});
const rec = (i, t = NOW, prev = null) => C.updateSessionRecord(prev, C.parseStatus(i, t));

test('parser: entrada completa', () => {
  const s = C.parseStatus(input(), NOW);
  assert.equal(s.sessionId, 's1'); assert.equal(s.model, 'Sonnet 5.5');
  assert.equal(s.context.remainingPct, 72); assert.equal(s.limits.fiveHour.usedPct, 31);
  assert.equal(s.limits.fiveHour.resetsAt, sec + 3600); assert.equal(s.hasRateLimits, true); assert.equal(s.costUsd, 0.12);
});
test('parser: entrada inválida retorna null', () => {
  for (const v of [null, undefined, 'x', 5, []]) assert.equal(C.parseStatus(v, NOW), null);
});
test('parser: objeto vazio -> tudo null, sessão "unknown"', () => {
  const s = C.parseStatus({}, NOW);
  assert.equal(s.sessionId, 'unknown'); assert.equal(s.model, null); assert.equal(s.context.remainingPct, null);
  assert.equal(s.costUsd, null); assert.equal(s.hasRateLimits, false);
});
test('parser: campos null (início de sessão) não viram 0', () => {
  const s = C.parseStatus(input({ context_window: { used_percentage: null, remaining_percentage: null, context_window_size: 200000 }, cost: {} }), NOW);
  assert.equal(s.context.remainingPct, null); assert.equal(s.context.usedPct, null); assert.equal(s.costUsd, null);
});
test('parser: só used_percentage -> deduz remaining; e vice-versa', () => {
  assert.equal(C.parseStatus({ context_window: { used_percentage: 40 } }, NOW).context.remainingPct, 60);
  assert.equal(C.parseStatus({ context_window: { remaining_percentage: 40 } }, NOW).context.usedPct, 60);
});
test('parser: valores 0 e 100 e fora da faixa', () => {
  const s = C.parseStatus({ rate_limits: { five_hour: { used_percentage: 100, resets_at: sec + 10 }, seven_day: { used_percentage: 0, resets_at: sec + 10 } }, context_window: { used_percentage: 130 } }, NOW);
  assert.equal(s.limits.fiveHour.usedPct, 100); assert.equal(s.limits.sevenDay.usedPct, 0); assert.equal(s.context.usedPct, 100);
  assert.equal(C.parseStatus({ context_window: { remaining_percentage: -5 } }, NOW).context.remainingPct, 0);
});
test('parser: conta sem rate_limits', () => {
  const s = C.parseStatus(input({ rate_limits: undefined }), NOW);
  assert.equal(s.hasRateLimits, false); assert.equal(s.limits.fiveHour, null);
  const v = C.buildView([rec(input({ rate_limits: undefined }))], { now: NOW });
  assert.equal(v.limits.fiveHour.status, 'unavailable'); assert.equal(v.limits.fiveHour.etaSec, null); assert.equal(v.limits.accountHasRateLimits, false);
  assert.match(C.describeReset(v.limits.fiveHour), /Indisponível/);
});
test('parser: apenas uma janela presente', () => {
  const s = C.parseStatus(input({ rate_limits: { five_hour: { used_percentage: 10, resets_at: sec + 5 } } }), NOW);
  assert.ok(s.limits.fiveHour); assert.equal(s.limits.sevenDay, null);
});
test('parser: tipos errados são ignorados, não coeridos', () => {
  const s = C.parseStatus({ context_window: { used_percentage: '50' }, cost: { total_cost_usd: 'abc' }, rate_limits: { five_hour: { used_percentage: 'x', resets_at: 'lixo' } } }, NOW);
  assert.equal(s.context.usedPct, null); assert.equal(s.costUsd, null); assert.equal(s.limits.fiveHour, null);
});
test('resets_at: segundos, ms e ISO convergem para o mesmo instante (UTC)', () => {
  assert.equal(C.toEpochSeconds(1738425600), 1738425600);
  assert.equal(C.toEpochSeconds(1738425600000), 1738425600);
  assert.equal(C.toEpochSeconds('2025-02-01T16:00:00Z'), 1738425600);
  assert.equal(C.toEpochSeconds(0), null); assert.equal(C.toEpochSeconds(-1), null); assert.equal(C.toEpochSeconds(null), null); assert.equal(C.toEpochSeconds('x'), null);
});
test('formato de horário: UTC vs fuso local explícito', () => {
  const t = 1738425600; // 2025-02-01 16:00:00 UTC
  assert.match(C.formatInstant(t, 'UTC'), /01\/02\/2025,? 16:00/);
  assert.match(C.formatInstant(t, 'America/Sao_Paulo'), /01\/02\/2025,? 13:00/);
  assert.match(C.formatInstant(t, 'Asia/Tokyo'), /02\/02\/2025,? 01:00/);
  assert.equal(C.formatInstant(null), null);
});
test('duração', () => {
  assert.equal(C.formatDuration(0), '00:00:00'); assert.equal(C.formatDuration(3661), '01:01:01');
  assert.equal(C.formatDuration(90061), '1d 01:01:01'); assert.equal(C.formatDuration(null), null); assert.equal(C.formatDuration(-4), '00:00:00');
});

test('humor: limites 51/50/30/29/1/0', () => {
  assert.equal(C.computeMood(51, null, null), 'happy'); assert.equal(C.computeMood(50, null, null), 'sad');
  assert.equal(C.computeMood(30, null, null), 'sad'); assert.equal(C.computeMood(29, null, null), 'worried');
  assert.equal(C.computeMood(1, null, null), 'worried'); assert.equal(C.computeMood(0.4, null, null), 'worried');
  assert.equal(C.computeMood(100, null, null), 'happy');
});
test('humor: contexto 0% NÃO dorme; quota 0% dorme', () => {
  assert.equal(C.computeMood(0, 80, 80), 'worried'); assert.equal(C.computeMood(0, null, null), 'worried');
  assert.equal(C.computeMood(90, 0, 80), 'sleeping'); assert.equal(C.computeMood(90, 80, 0), 'sleeping'); assert.equal(C.computeMood(0, 0, null), 'sleeping');
});
test('humor: sem dados -> unknown; usa o menor saldo conhecido', () => {
  assert.equal(C.computeMood(null, null, null), 'unknown'); assert.equal(C.computeMood(90, 20, 80), 'worried'); assert.equal(C.computeMood(90, 45, 80), 'sad');
});

test('limite 100% usado: esgotado, ETA só com resets_at', () => {
  const v = C.buildView([rec(input({ rate_limits: { five_hour: { used_percentage: 100, resets_at: sec + 1800 } } }))], { now: NOW });
  assert.equal(v.limits.fiveHour.status, 'exhausted'); assert.equal(v.limits.fiveHour.etaSec, 1800); assert.equal(v.mood, 'sleeping'); assert.equal(v.blocked, true);
  const v2 = C.buildView([rec(input({ rate_limits: { five_hour: { used_percentage: 100 } } }))], { now: NOW });
  assert.equal(v2.mood, 'sleeping'); assert.equal(v2.limits.fiveHour.etaSec, null); assert.match(C.describeReset(v2.limits.fiveHour), /indisponível/);
});
test('limite 0% usado', () => {
  const v = C.buildView([rec(input({ rate_limits: { five_hour: { used_percentage: 0, resets_at: sec + 60 } } }))], { now: NOW });
  assert.equal(v.limits.fiveHour.remainingPct, 100); assert.equal(v.limits.fiveHour.status, 'ok');
});
test('reset passou: janela vira "renewed", acorda, sem % inventado', () => {
  const r = rec(input({ rate_limits: { five_hour: { used_percentage: 100, resets_at: sec + 60 } } }));
  const before = C.buildView([r], { now: NOW }), after = C.buildView([r], { now: NOW + 61000 });
  assert.equal(before.mood, 'sleeping'); assert.equal(after.limits.fiveHour.status, 'renewed');
  assert.equal(after.limits.fiveHour.remainingPct, null); assert.equal(after.blocked, false); assert.notEqual(after.mood, 'sleeping');
});
test('evento sem a janela mantém a anterior só até o reset', () => {
  const a = rec(input({ rate_limits: { five_hour: { used_percentage: 40, resets_at: sec + 600 } } }), NOW);
  const noRl = input({ rate_limits: undefined });
  const b = C.updateSessionRecord(a, C.parseStatus(noRl, NOW + 1000));
  assert.equal(b.limits.fiveHour.usedPct, 40);
  const c = C.updateSessionRecord(a, C.parseStatus(noRl, NOW + 700000));
  assert.equal(c.limits.fiveHour, null);
});

test('custo: deltas por modelo e troca de modelo', () => {
  let r = rec(input({ cost: { total_cost_usd: 0.10 } }), NOW);
  r = C.updateSessionRecord(r, C.parseStatus(input({ cost: { total_cost_usd: 0.30 } }), NOW + 1000));
  r = C.updateSessionRecord(r, C.parseStatus(input({ model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, cost: { total_cost_usd: 0.80 } }), NOW + 2000));
  assert.equal(r.costUsd, 0.80); assert.equal(r.model, 'Opus 5.5');
  assert.equal(r.perModel['Sonnet 5.5'], 0.30); assert.equal(r.perModel['Opus 5.5'], 0.50);
});
test('custo: mesmo evento repetido não duplica', () => {
  let r = rec(input(), NOW);
  for (let i = 1; i <= 5; i++) r = C.updateSessionRecord(r, C.parseStatus(input(), NOW + i));
  assert.equal(r.perModel['Sonnet 5.5'], 0.12);
});
test('custo: contador reinicia (/clear) -> recomeça sem perder o histórico', () => {
  let r = rec(input({ cost: { total_cost_usd: 0.50 } }), NOW);
  r = C.updateSessionRecord(r, C.parseStatus(input({ cost: { total_cost_usd: 0.05 } }), NOW + 1));
  assert.equal(r.costResets, 1); assert.equal(r.perModel['Sonnet 5.5'], 0.55); assert.equal(r.costUsd, 0.05);
});
test('custo: evento sem custo preserva o anterior', () => {
  let r = rec(input(), NOW);
  r = C.updateSessionRecord(r, C.parseStatus(input({ cost: undefined }), NOW + 1));
  assert.equal(r.costUsd, 0.12); assert.equal(r.perModel['Sonnet 5.5'], 0.12);
});
test('sessão diferente não herda custo nem modelo da anterior', () => {
  const a = rec(input({ cost: { total_cost_usd: 5 } }), NOW);
  const b = C.updateSessionRecord(a, C.parseStatus(input({ session_id: 's2', cost: { total_cost_usd: 0.2 } }), NOW + 1));
  assert.equal(b.sessionId, 's2'); assert.equal(b.perModel['Sonnet 5.5'], 0.2); assert.equal(b.costUsd, 0.2);
});

test('várias sessões: agregação sem dupla contagem; limites vêm do evento mais recente', () => {
  const s1 = rec(input({ session_id: 'A', cost: { total_cost_usd: 1 }, rate_limits: { five_hour: { used_percentage: 20, resets_at: sec + 900 } } }), NOW - 5000);
  const s2 = rec(input({ session_id: 'B', model: { display_name: 'Opus' }, cost: { total_cost_usd: 2 }, rate_limits: { five_hour: { used_percentage: 25, resets_at: sec + 900 } } }), NOW);
  const v = C.buildView([s1, s2, s1, { ...s1 }].slice(0, 2), { now: NOW });
  assert.equal(v.aggregate.totalUsd, 3); assert.equal(v.aggregate.sessionCount, 2);
  assert.deepEqual(v.aggregate.perModel, { 'Sonnet 5.5': 1, Opus: 2 });
  assert.equal(v.limits.fiveHour.usedPct, 25); assert.equal(v.selectedId, 'B');
  const vA = C.buildView([s1, s2], { now: NOW, sessionId: 'A' });
  assert.equal(vA.selectedId, 'A'); assert.equal(vA.selected.costUsd, 1); assert.equal(vA.aggregate.totalUsd, 3); assert.equal(vA.autoSelected, false);
  assert.equal(C.buildView([s1, s2], { now: NOW, sessionId: 'inexistente' }).autoSelected, true);
});
test('sessões: ativa/ociosa e descarte após 7 dias', () => {
  const old = rec(input({ session_id: 'old' }), NOW - 8 * 86400e3), idle = rec(input({ session_id: 'idle' }), NOW - 10 * 60e3), live = rec(input({ session_id: 'live' }), NOW - 5e3);
  const v = C.buildView([old, idle, live], { now: NOW });
  assert.deepEqual(v.sessions.map(s => [s.id, s.active]), [['live', true], ['idle', false]]);
});
test('sem sessões: view vazia e "unknown"', () => {
  const v = C.buildView([], { now: NOW });
  assert.equal(v.selected, null); assert.equal(v.mood, 'unknown'); assert.equal(v.aggregate.totalUsd, 0); assert.equal(C.buildView(undefined, { now: NOW }).selectedId, null);
});
test('buildView ignora registros malformados', () => {
  const v = C.buildView([null, {}, { sessionId: 5 }, { sessionId: 'x', observedAt: 'ontem' }, rec(input(), NOW)], { now: NOW });
  assert.equal(v.sessions.length, 1);
});
test('tokens livres só quando há tamanho de janela e %; é estimativa', () => {
  const v = C.buildView([rec(input(), NOW)], { now: NOW });
  assert.equal(v.selected.context.freeTokens, 144000);
  const v2 = C.buildView([rec(input({ context_window: { remaining_percentage: 50 } }), NOW)], { now: NOW });
  assert.equal(v2.selected.context.freeTokens, null);
});
test('contexto cheio não bloqueia nem vira quota', () => {
  const v = C.buildView([rec(input({ context_window: { used_percentage: 100, remaining_percentage: 0, context_window_size: 200000 } }), NOW)], { now: NOW });
  assert.equal(v.blocked, false); assert.equal(v.mood, 'worried'); assert.equal(v.limits.fiveHour.status, 'ok');
});
