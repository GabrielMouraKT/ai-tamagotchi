'use strict';
// Mescla APENAS a chave "statusLine" em ~/.claude/settings.json. Usado pelo CLI (install-statusline.js) e pelo app (botão "Conectar").
// Sempre faz backup antes de gravar e nunca sobrescreve uma statusLine diferente sem `force`.
const fs = require('fs'), os = require('os'), path = require('path');

const defaultSettingsPath = () => path.join(os.homedir(), '.claude', 'settings.json');
const isOurs = c => typeof c === 'string' && /ai[ -]tamagotchi/i.test(c) && /statusline\.(js|cmd)/i.test(c);

function apply({ settingsPath = defaultSettingsPath(), command, force = false, remove = false, dryRun = false } = {}) {
  let text = null, settings = {};
  try { text = fs.readFileSync(settingsPath, 'utf8').replace(/^﻿/, ''); }
  catch (e) { if (e.code !== 'ENOENT') return { status: 'read-error', code: e.code, settingsPath }; }
  if (text !== null) {
    try { settings = JSON.parse(text); } catch { return { status: 'invalid-json', settingsPath }; }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { status: 'invalid-json', settingsPath };
  }
  const current = settings.statusLine;
  if (remove) {
    if (!current) return { status: 'none' };
    // É nossa se for exatamente o comando que gravaríamos (qualquer pasta de instalação) ou se tiver a assinatura do app.
    if (!(command && current.command === command) && !isOurs(current.command)) return { status: 'not-ours', current };
    delete settings.statusLine;
  } else {
    if (current && current.command === command) return { status: 'already' };
    if (current && !force) return { status: 'exists-different', current };
    settings.statusLine = { type: 'command', command };
  }
  const out = JSON.stringify(settings, null, 2) + '\n';
  if (dryRun) return { status: 'dry-run', out };
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    let backup = null;
    if (text !== null) { backup = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`; fs.copyFileSync(settingsPath, backup); }
    const tmp = settingsPath + '.tmp-' + process.pid; fs.writeFileSync(tmp, out); fs.renameSync(tmp, settingsPath);
    return { status: remove ? 'removed' : 'installed', backup, command };
  } catch (e) { return { status: 'write-error', code: e.code, settingsPath }; }
}

module.exports = { apply, isOurs, defaultSettingsPath };
