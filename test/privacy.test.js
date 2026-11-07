'use strict';
// Garante, no código, o que o app promete na tela de Privacidade: só o necessário, nada de rede externa, nada de credenciais.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const store = require('../lib/store');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sources = ['app.js', 'index.html', 'style.css', 'desktop-ui.js', 'server.js', 'statusline.js', 'install-statusline.js',
  ...fs.readdirSync(path.join(ROOT, 'lib')).map(f => 'lib/' + f), ...fs.readdirSync(path.join(ROOT, 'electron')).map(f => 'electron/' + f)];

test('privacidade: nenhum endereço externo (só 127.0.0.1/localhost) em todo o código do app', () => {
  for (const f of sources) {
    const hits = (read(f).match(/https?:\/\/[^\s'"`)<>]+/gi) || []).filter(u => !/^https?:\/\/(127\.0\.0\.1|localhost)([:\/]|$)/i.test(u));
    assert.deepEqual(hits, [], `${f} contém endereço externo: ${hits.join(', ')}`);
  }
});
test('privacidade: sem módulos de rede externa nem chamadas fetch para fora', () => {
  for (const f of sources.filter(x => x.endsWith('.js') || x.endsWith('.cjs'))) {
    const src = read(f);
    assert.ok(!/require\(['"](https|net|dgram|tls|http2)['"]\)/.test(src), `${f} importa módulo de rede`);
    assert.ok(!/fetch\(\s*['"`]https?:/.test(src), `${f} faz fetch externo`);
    assert.ok(!/WebSocket\(|XMLHttpRequest/.test(src) || f === 'x', `${f} abre conexão`);
  }
  assert.ok(!/shell\.openExternal|\bopen\(/.test(read('electron/main.cjs')));
});
test('privacidade: o código não toca em credenciais, cookies, tokens nem transcrições', () => {
  const bad = /\.credentials|credentials\.json|oauth|\bcookies?\b|Login Data|keychain|transcript_path|\.jsonl|Authorization|api[_-]?key|password/i;
  for (const f of sources.filter(x => x.endsWith('.js') || x.endsWith('.cjs') || x.endsWith('.ps1'))) {
    const code = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*#.*$/gm, '');
    const m = code.match(bad); assert.equal(m, null, `${f} menciona "${m && m[0]}"`);
  }
});
test('privacidade: só campos de telemetria são gravados; prompt, transcrição, pasta de trabalho e afins são descartados', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tama-priv-'));
  store.recordStatus(dir, {
    session_id: 'priv-1', model: { id: 'm', display_name: 'Sonnet' }, transcript_path: 'C:/Users/segredo/conversa-secreta.jsonl',
    cwd: 'C:/Users/segredo/projeto-confidencial', workspace: { current_dir: 'C:/Users/segredo/projeto-confidencial', project_dir: 'C:/x/cliente' },
    prompt: 'minha senha é 123456', output_style: { name: 'x' }, version: '9.9.9', api_key: 'sk-ant-SEGREDO',
    context_window: { used_percentage: 20, remaining_percentage: 80, context_window_size: 200000, current_usage: { input_tokens: 5 } },
    cost: { total_cost_usd: 1, total_duration_ms: 1234, total_lines_added: 9 }, rate_limits: { five_hour: { used_percentage: 5, resets_at: 4102444800 } },
  });
  const dump = fs.readFileSync(path.join(dir, 'sessions', fs.readdirSync(path.join(dir, 'sessions'))[0]), 'utf8');
  for (const secret of ['segredo', 'confidencial', 'cliente', 'senha', '123456', 'sk-ant', 'jsonl', 'transcript', 'cwd', 'workspace', 'prompt', 'api_key', 'total_lines_added', '9.9.9']) assert.ok(!dump.includes(secret), `gravou "${secret}"`);
  const rec = JSON.parse(dump);
  assert.deepEqual(Object.keys(rec).sort(), ['context', 'costResets', 'costUsd', 'firstSeen', 'limits', 'model', 'modelId', 'observedAt', 'perModel', 'sessionId', 'v']);
});
test('privacidade: o app mostra ao usuário o que usa e o que não faz (tela Privacidade e tela Conectar)', () => {
  const app = read('app.js');
  for (const frase of ['Não lê suas conversas', 'Não pede login', 'Não envia nada pela internet', 'Não lê o conteúdo do terminal', 'não são salvos nem enviados']) assert.ok(app.toLowerCase().includes(frase.toLowerCase()), frase);
  assert.match(app, /mk\('Privacidade'/);
});
