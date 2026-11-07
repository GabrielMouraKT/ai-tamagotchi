'use strict';
// Ponta a ponta: statusline.js (processo real, via stdin) -> arquivos em disco -> servidor HTTP -> /api/state.
const test = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { createServer } = require('../server'), store = require('../lib/store'), core = require('../lib/core');

const ROOT = path.join(__dirname, '..');
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tama-'));
const sec = () => Math.floor(Date.now() / 1000);
const payload = (o = {}) => ({ session_id: 'sess-1', model: { id: 'm', display_name: 'Sonnet' }, context_window: { used_percentage: 20, remaining_percentage: 80, context_window_size: 200000, total_input_tokens: 1000, total_output_tokens: 50 }, cost: { total_cost_usd: 0.1 }, rate_limits: { five_hour: { used_percentage: 10, resets_at: sec() + 3000 }, seven_day: { used_percentage: 5, resets_at: sec() + 90000 } }, ...o });
const run = (dir, stdin) => spawnSync(process.execPath, [path.join(ROOT, 'statusline.js')], { input: stdin, encoding: 'utf8', env: { ...process.env, AI_TAMAGOTCHI_DIR: dir } });
const get = (port, p, host) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p, headers: host ? { Host: host } : {} }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b, headers: r.headers })); }).on('error', rej));

test('statusline: entrada documentada -> linha impressa, exit 0, arquivo da sessão gravado', () => {
  const dir = mk(); const r = run(dir, JSON.stringify(payload()));
  assert.equal(r.status, 0); assert.match(r.stdout, /Sonnet/); assert.match(r.stdout, /ctx 80% livre/); assert.match(r.stdout, /est\./);
  assert.equal(fs.readdirSync(path.join(dir, 'sessions')).length, 1);
});
test('statusline: tolera BOM UTF-8 no stdin (PowerShell 5.1)', () => {
  const r = run(mk(), '﻿' + JSON.stringify(payload())); assert.match(r.stdout, /Sonnet/);
});
test('statusline: lixo/vazio/JSON inválido não quebra (exit 0, mensagem de espera)', () => {
  for (const s of ['', 'não é json', '[]', 'null', '{']) { const r = run(mk(), s); assert.equal(r.status, 0, s); assert.match(r.stdout, /aguardando telemetria/, s); }
});
test('statusline: campos ausentes -> n/d, sem inventar', () => {
  const r = run(mk(), JSON.stringify({ session_id: 'x' }));
  assert.match(r.stdout, /5h n\/d/); assert.match(r.stdout, /7d n\/d/); assert.match(r.stdout, /ctx n\/d livre/); assert.match(r.stdout, /~\$n\/d/);
});
test('statusline: falha de acesso à pasta de dados -> ainda imprime, exit 0', () => {
  const dir = mk(); const blocker = path.join(dir, 'arquivo'); fs.writeFileSync(blocker, 'x'); // "pasta" é um arquivo
  const r = run(path.join(blocker, 'sub'), JSON.stringify(payload()));
  assert.equal(r.status, 0); assert.match(r.stdout, /Sonnet/); assert.match(r.stdout, /sem gravar/);
});
test('statusline: reinício do processo continua o custo da mesma sessão (sem dupla contagem)', () => {
  const dir = mk();
  run(dir, JSON.stringify(payload({ cost: { total_cost_usd: 0.1 } })));
  run(dir, JSON.stringify(payload({ cost: { total_cost_usd: 0.1 } })));
  run(dir, JSON.stringify(payload({ cost: { total_cost_usd: 0.4 } })));
  const rec = store.readSessions(dir).sessions[0];
  assert.equal(rec.perModel.Sonnet, 0.4); assert.equal(rec.costUsd, 0.4);
});
test('statusline: arquivo da sessão corrompido é recriado', () => {
  const dir = mk(); run(dir, JSON.stringify(payload()));
  const f = path.join(dir, 'sessions', fs.readdirSync(path.join(dir, 'sessions'))[0]); fs.writeFileSync(f, '{corrompido');
  const r = run(dir, JSON.stringify(payload())); assert.equal(r.status, 0);
  assert.equal(store.readSessions(dir).sessions.length, 1);
});
test('várias instâncias simultâneas: um arquivo por sessão, sem interferência', () => {
  const dir = mk();
  for (let i = 0; i < 4; i++) run(dir, JSON.stringify(payload({ session_id: 'S' + i, cost: { total_cost_usd: i + 1 } })));
  const { sessions, errors } = store.readSessions(dir);
  assert.equal(sessions.length, 4); assert.equal(errors.length, 0);
  assert.equal(core.buildView(sessions, {}).aggregate.totalUsd, 10);
});
test('session_id hostil não escapa da pasta de dados', () => {
  const dir = mk(); run(dir, JSON.stringify(payload({ session_id: '../../evil' })));
  assert.equal(fs.readdirSync(path.join(dir, 'sessions')).length, 1);
  assert.equal(fs.existsSync(path.join(dir, '..', 'evil.json')), false);
  assert.notEqual(store.sessionFileName('a/b'), store.sessionFileName('a_b')); // sem colisão após sanitizar
});
test('leitura: pasta ausente -> vazio; arquivo ilegível/JSON ruim -> errors, sem lançar', () => {
  assert.deepEqual(store.readSessions(path.join(mk(), 'nada')), { sessions: [], errors: [] });
  const dir = mk(); fs.mkdirSync(path.join(dir, 'sessions')); fs.writeFileSync(path.join(dir, 'sessions', 'a.json'), '{ruim'); fs.writeFileSync(path.join(dir, 'sessions', 'b.json'), '{"x":1}');
  fs.mkdirSync(path.join(dir, 'sessions', 'dir.json')); // diretório com nome .json -> EISDIR
  const r = store.readSessions(dir); assert.equal(r.sessions.length, 0); assert.equal(r.errors.length, 3);
});

test('servidor: /api/state reflete o statusline; estáticos só da allowlist; Host estranho bloqueado', async () => {
  const dir = mk(); run(dir, JSON.stringify(payload()));
  const srv = createServer({ dir, port: 0 }); const port = await srv.start();
  try {
    const s = await get(port, '/api/state'); assert.equal(s.status, 200); assert.match(s.headers['cache-control'], /no-store/);
    const j = JSON.parse(s.body); assert.equal(j.sessions.length, 1); assert.equal(j.sessions[0].sessionId, 'sess-1');
    run(dir, JSON.stringify(payload({ session_id: 'sess-2' })));
    assert.equal(JSON.parse((await get(port, '/api/state')).body).sessions.length, 2);
    assert.equal((await get(port, '/')).status, 200);
    assert.equal((await get(port, '/lib/core.js')).status, 200);
    assert.equal((await get(port, '/assets/fox.png')).status, 200);
    for (const p of ['/server.js', '/lib/store.js', '/PROMPT_CLAUDE_CODE.md', '/test/core.test.js', '/%2e%2e/%2e%2e/windows/win.ini', '/assets/../server.js']) assert.equal((await get(port, p)).status, 404, p);
    assert.equal((await get(port, '/%E0%A4%A')).status, 400);
    assert.equal((await get(port, '/api/state', 'evil.example.com')).status, 403);
  } finally { srv.close(); }
});
test('servidor: pasta de dados inexistente/ilegível -> 200 com lista vazia', async () => {
  const srv = createServer({ dir: path.join(mk(), 'nao-existe'), port: 0 }); const port = await srv.start();
  try { const j = JSON.parse((await get(port, '/api/state')).body); assert.deepEqual(j.sessions, []); } finally { srv.close(); }
});

test('catálogo: 18 mascotes, ids únicos, PNG existente, assets sem órfãos', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mascots.json'), 'utf8'));
  assert.equal(cat.length, 18); assert.equal(new Set(cat.map(m => m.id)).size, 18);
  for (const m of cat) { assert.ok(m.name && m.description, m.id); assert.ok(fs.existsSync(path.join(ROOT, m.src)), m.src); assert.equal(m.src, `assets/${m.id}.png`); }
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'assets')).filter(f => f.endsWith('.png')).sort(), cat.map(m => m.id + '.png').sort());
});
