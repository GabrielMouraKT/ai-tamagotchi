'use strict';
// Regras do pacote .exe que já quebraram (ou quebrariam) na prática. Ver build/ e a seção "build" do package.json.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('pacote: package.json é CommonJS e vai junto, fora do asar, para o statusline.js (evita herdar "type":"module" da pasta do usuário)', () => {
  assert.equal(pkg.type, 'commonjs');
  for (const f of ['package.json', 'statusline.js', 'lib/**', 'electron/follow-terminal.ps1']) assert.ok(pkg.build.asarUnpack.includes(f), `asarUnpack sem ${f}`);
});
test('pacote: statusline.cmd roda o statusline.js desempacotado com o runtime do app (sem Node instalado)', () => {
  const cmd = fs.readFileSync(path.join(ROOT, 'build', 'statusline.cmd'), 'utf8');
  assert.match(cmd, /ELECTRON_RUN_AS_NODE=1/); assert.match(cmd, /app\.asar\.unpacked\\statusline\.js/); assert.match(cmd, /AI Tamagotchi\.exe/);
  assert.deepEqual(pkg.build.extraResources, [{ from: 'build/statusline.cmd', to: 'statusline.cmd' }]);
});
test('pacote: ícone do Foguinho para exe, instalador e desinstalador; sem GIFs/testes; instalação por usuário (sem administrador)', () => {
  assert.equal(pkg.build.win.icon, 'build/icon.ico'); assert.equal(pkg.build.nsis.installerIcon, 'build/icon.ico'); assert.equal(pkg.build.nsis.uninstallerIcon, 'build/icon.ico');
  const ico = fs.readFileSync(path.join(ROOT, 'build', 'icon.ico')); assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.ok(ico.readUInt16LE(4) >= 6); // ICONDIR com 6+ tamanhos
  assert.ok(pkg.build.files.includes('!mascotes/**/*.gif')); assert.ok(!pkg.build.files.some(f => /test/.test(f)));
  assert.equal(pkg.build.nsis.perMachine, false); assert.equal(pkg.build.nsis.oneClick, true);
});
