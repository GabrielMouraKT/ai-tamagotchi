'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const SCRIPT = path.join(__dirname, '..', 'install-statusline.js');
const run = (file, ...a) => spawnSync(process.execPath, [SCRIPT, '--settings', file, ...a], { encoding: 'utf8' });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tama-inst-')), 'settings.json');

test('instalador: preserva todas as outras chaves e cria backup', () => {
  const f = tmp(); const orig = { theme: 'dark', enabledPlugins: { a: true }, hooks: { x: [1] } };
  fs.writeFileSync(f, JSON.stringify(orig));
  const r = run(f); assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual({ ...after, statusLine: undefined }, { ...orig, statusLine: undefined });
  assert.equal(after.statusLine.type, 'command'); assert.match(after.statusLine.command, /^node ".*\/statusline\.js"$/); assert.ok(!after.statusLine.command.includes('\\'));
  const baks = fs.readdirSync(path.dirname(f)).filter(n => n.includes('.bak-')); assert.equal(baks.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(path.dirname(f), baks[0]), 'utf8')), orig);
});
test('instalador: não sobrescreve statusLine alheia sem --force; --force guarda backup', () => {
  const f = tmp(); const mine = { statusLine: { type: 'command', command: 'outra-coisa' }, k: 1 };
  fs.writeFileSync(f, JSON.stringify(mine));
  assert.equal(run(f).status, 2); assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), mine);
  assert.equal(run(f, '--force').status, 0); assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).k, 1);
});
test('instalador: idempotente, --dry-run não grava, --remove só remove a nossa', () => {
  const f = tmp(); fs.writeFileSync(f, '{"a":1}');
  assert.equal(run(f, '--dry-run').status, 0); assert.equal(fs.readFileSync(f, 'utf8'), '{"a":1}');
  run(f); const once = fs.readFileSync(f, 'utf8'); const r2 = run(f); assert.equal(r2.status, 0); assert.equal(fs.readFileSync(f, 'utf8'), once);
  assert.equal(run(f, '--remove').status, 0); assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: 1 });
  fs.writeFileSync(f, JSON.stringify({ statusLine: { type: 'command', command: 'x' } })); assert.equal(run(f, '--remove').status, 1);
});
test('módulo: desconectar reconhece o comando exato do app em qualquer pasta de instalação, e recusa o que não é dele', () => {
  const inst = require('../lib/installer'); const f = tmp(); const mine = '"C:/Users/x/Pasta Qualquer/resources/statusline.cmd"';
  fs.writeFileSync(f, JSON.stringify({ a: 1, statusLine: { type: 'command', command: mine } }));
  assert.equal(inst.apply({ settingsPath: f, command: mine, remove: true }).status, 'removed'); assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: 1 });
  fs.writeFileSync(f, JSON.stringify({ statusLine: { type: 'command', command: 'outra-ferramenta --x' } }));
  assert.equal(inst.apply({ settingsPath: f, command: mine, remove: true }).status, 'not-ours');
  assert.equal(inst.apply({ settingsPath: f, command: mine }).status, 'exists-different');                 // instalar não sobrescreve
  assert.equal(inst.apply({ settingsPath: path.join(path.dirname(f), 'novo', 'settings.json'), command: mine }).status, 'installed'); // arquivo/pasta ausentes
});
test('instalador: JSON inválido não é tocado; arquivo ausente é criado; BOM tolerado', () => {
  const f = tmp(); fs.writeFileSync(f, '{quebrado'); assert.equal(run(f).status, 1); assert.equal(fs.readFileSync(f, 'utf8'), '{quebrado');
  const g = tmp(); assert.equal(run(g).status, 0); assert.ok(JSON.parse(fs.readFileSync(g, 'utf8')).statusLine);
  const h = tmp(); fs.writeFileSync(h, '﻿{"z":1}'); assert.equal(run(h).status, 0); assert.equal(JSON.parse(fs.readFileSync(h, 'utf8')).z, 1);
});
