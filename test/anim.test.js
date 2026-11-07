'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const A = require('../lib/anim'), C = require('../lib/core');
const { createServer } = require('../server');
const ROOT = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'mascots.json'), 'utf8'));
const get = (port, p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, r => { const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, type: r.headers['content-type'], len: Buffer.concat(b).length })); }).on('error', rej));

test('frames: 18 mascotes × 8 estados, todos os PNG existem e batem com o manifest', () => {
  assert.equal(A.STATES.length, 8); assert.equal(catalog.length, 18);
  for (const m of catalog) {
    const dir = path.join(ROOT, 'mascotes', m.id);
    assert.ok(fs.existsSync(path.join(dir, 'original.png')), m.id + ' original.png');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const st of A.STATES) {
      assert.equal(manifest.animations[st].frames, A.COUNTS[st], `${m.id}/${st} manifest`);
      for (let i = 0; i < A.COUNTS[st]; i++) assert.ok(fs.existsSync(path.join(ROOT, A.framePath(m.id, st, i))), A.framePath(m.id, st, i));
      assert.ok(fs.existsSync(path.join(dir, 'animacoes', st, `${st}.gif`)), `${m.id}/${st} gif`);
    }
  }
});
test('frames: caminho seguro e com índice circular; entrada inválida -> null', () => {
  assert.equal(A.framePath('fox', 'feliz', 0), 'mascotes/fox/animacoes/feliz/frame_000.png');
  assert.equal(A.framePath('fox', 'piscar', 6), 'mascotes/fox/animacoes/piscar/frame_000.png');
  assert.equal(A.framePath('fox', 'piscar', -1), 'mascotes/fox/animacoes/piscar/frame_005.png');
  assert.equal(A.framePath('../x', 'idle', 0), null); assert.equal(A.framePath('fox', 'inexistente', 0), null);
});
test('mapa humor -> animação (quota/contexto)', () => {
  assert.equal(A.baseState('happy'), 'feliz'); assert.equal(A.baseState('sad'), 'triste'); assert.equal(A.baseState('worried'), 'preocupado');
  assert.equal(A.baseState('sleeping'), 'dormir'); assert.equal(A.baseState('unknown'), 'idle'); assert.equal(A.baseState('?'), 'idle');
});
test('dormir só com quota esgotada: contexto 0 com quota ativa -> preocupado; limites ausentes -> idle', () => {
  const view = (ctx, five, week) => C.buildView([{ sessionId: 's', observedAt: 1e12, model: 'm', context: { remainingPct: ctx }, limits: { fiveHour: five && { usedPct: five, resetsAt: 1e12 / 1000 + 600, seenAt: 1e12 }, sevenDay: week && { usedPct: week, resetsAt: 1e12 / 1000 + 600, seenAt: 1e12 } }, costUsd: 0, perModel: {} }], { now: 1e12 });
  assert.equal(A.baseState(view(0, 40, 40).mood), 'preocupado');   // contexto 0, quota ativa
  assert.equal(A.baseState(view(0, null, null).mood), 'preocupado'); // contexto 0, sem rate_limits: não dorme
  assert.equal(A.baseState(view(null, null, null).mood), 'idle');   // nada informado
  assert.equal(A.baseState(view(80, 100, 10).mood), 'dormir');       // 5h esgotada
  assert.equal(A.baseState(view(80, 10, 100).mood), 'dormir');       // semanal esgotada
  assert.equal(A.baseState(view(80, 99, 99).mood), 'preocupado');    // 1% livre não dorme
  assert.equal(view(80, 100, null).limits.fiveHour.etaSec, 600);      // reset válido -> ETA real
});
test('prioridade: despertar > comer_tokens > piscar > repouso; ações expiram', () => {
  const base = { mood: 'happy', nowMs: 1000 };
  assert.equal(A.chooseState({ ...base, wakeUntil: 2000, actionName: 'comer_tokens', actionUntil: 2000 }), 'despertar');
  assert.equal(A.chooseState({ ...base, actionName: 'comer_tokens', actionUntil: 2000, blinkUntil: 2000 }), 'comer_tokens');
  assert.equal(A.chooseState({ ...base, blinkUntil: 2000 }), 'piscar');
  assert.equal(A.chooseState({ ...base, wakeUntil: 900, actionName: 'comer_tokens', actionUntil: 900, blinkUntil: 900 }), 'feliz');
  assert.equal(A.chooseState({ mood: 'sleeping', nowMs: 1000, blinkUntil: 2000 }), 'dormir'); // não pisca dormindo
  assert.equal(A.chooseState({ mood: 'worried', nowMs: 1000, blinkUntil: 2000 }), 'preocupado');
});
test('feliz alterna feliz/idle ao longo do tempo; demais humores são estáveis', () => {
  const seen = new Set(); for (let t = 0; t < 60000; t += 1000) seen.add(A.restingState('happy', t));
  assert.deepEqual([...seen].sort(), ['feliz', 'idle']);
  for (const t of [0, 7000, 14000]) { assert.equal(A.restingState('sad', t), 'triste'); assert.equal(A.restingState('sleeping', t), 'dormir'); }
});
test('one-shots e durações coerentes com os manifest (6,7 fps / 3,8 fps)', () => {
  for (const s of ['piscar', 'comer_tokens', 'despertar']) assert.ok(A.isOneShot(s)); for (const s of ['idle', 'feliz', 'dormir']) assert.ok(!A.isOneShot(s));
  assert.equal(A.frameMs('feliz'), 149); assert.equal(A.frameMs('dormir'), 263); assert.equal(A.durationMs('despertar'), 1490);
});

test('troca de mascote: paleta e frames existem para cada um dos 18', () => {
  for (const m of catalog) {
    assert.match(m.color, /^#[0-9a-f]{6}$/i, m.id + ' color'); assert.match(m.background, /^#[0-9a-f]{6}$/i, m.id + ' background');
    assert.ok(fs.existsSync(path.join(ROOT, m.src)), m.src);
    assert.ok(fs.existsSync(path.join(ROOT, A.framePath(m.id, 'idle', 0))));
  }
  assert.ok(new Set(catalog.map(m => m.color)).size >= 12); // a paleta realmente varia
});

test('servidor: escuta só em 127.0.0.1 e serve frames/GIF/manifest, mas não o resto do projeto', async () => {
  const srv = createServer({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'tama-a-')), port: 0 }); const port = await srv.start();
  try {
    assert.equal(srv.address().address, '127.0.0.1');
    const f = await get(port, '/mascotes/fox/animacoes/feliz/frame_000.png'); assert.equal(f.status, 200); assert.equal(f.type, 'image/png'); assert.ok(f.len > 100);
    assert.equal((await get(port, '/mascotes/fox/animacoes/dormir/dormir.gif')).type, 'image/gif');
    assert.equal((await get(port, '/mascotes/fox/manifest.json')).status, 200);
    assert.equal((await get(port, '/lib/anim.js')).status, 200);
    for (const p of ['/electron/main.cjs', '/package.json', '/install-statusline.js', '/mascotes/../server.js', '/mascotes/fox/../../server.js', '/mascotes/fox/animacoes/feliz/../../../../package.json']) assert.equal((await get(port, p)).status, 404, p);
  } finally { srv.close(); }
});
