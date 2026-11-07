'use strict';
// Mescla APENAS a chave "statusLine" em ~/.claude/settings.json, com backup antes de gravar.
// Uso: node install-statusline.js [--dry-run] [--force] [--remove] [--settings <arquivo>]
const path = require('path');
const installer = require('./lib/installer');

const args = process.argv.slice(2), flag = n => args.includes(n);
const si = args.indexOf('--settings');
const settingsPath = si >= 0 ? path.resolve(args[si + 1]) : installer.defaultSettingsPath();
// Barras normais: o Claude Code no Windows usa Git Bash, que corrompe barras invertidas.
const script = path.resolve(__dirname, 'statusline.js').replace(/\\/g, '/');
const command = `node "${script}"`;

const r = installer.apply({ settingsPath, command, force: flag('--force'), remove: flag('--remove'), dryRun: flag('--dry-run') });
const msg = {
  installed: () => `${r.backup ? 'Backup: ' + r.backup + '\n' : ''}statusLine configurada: ${command}`,
  removed: () => `${r.backup ? 'Backup: ' + r.backup + '\n' : ''}statusLine removida.`,
  already: () => 'statusLine já está configurada para este projeto. Nada a fazer.',
  none: () => 'Nenhuma statusLine configurada. Nada a fazer.',
  'dry-run': () => '[dry-run] settings resultante:\n' + r.out,
  'exists-different': () => `Já existe uma statusLine diferente; não sobrescrevi. Atual: ${JSON.stringify(r.current)}\nUse --force para substituir (o backup preserva a anterior).`,
  'not-ours': () => `A statusLine atual não é do AI Tamagotchi; não removi: ${JSON.stringify(r.current)}`,
  'invalid-json': () => `settings.json não é JSON válido; nada foi alterado: ${r.settingsPath}`,
  'read-error': () => `Não consegui ler ${r.settingsPath} (${r.code}).`,
  'write-error': () => `Não consegui gravar ${r.settingsPath} (${r.code}).`,
}[r.status]();
const ok = ['installed', 'removed', 'already', 'none', 'dry-run'].includes(r.status);
(ok ? console.log : console.error)(msg);
process.exit(ok ? 0 : r.status === 'exists-different' ? 2 : 1);
