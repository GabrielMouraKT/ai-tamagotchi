'use strict';
// Persistência local (somente Node): um arquivo JSON por sessão, para evitar corrida entre instâncias.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const core = require('./core');

const defaultDir = () => process.env.AI_TAMAGOTCHI_DIR || path.join(os.homedir(), '.claude', 'ai-tamagotchi');
const sessionsDir = dir => path.join(dir, 'sessions');

// Nome de arquivo seguro (sem path traversal); hash evita colisão quando o id precisou ser sanitizado.
function sessionFileName(id) {
  const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const h = crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 8);
  return (safe === id && safe.length <= 64 ? safe : `${safe}-${h}`) + '.json';
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  try { fs.renameSync(tmp, file); }
  catch { try { fs.writeFileSync(file, text); } finally { try { fs.unlinkSync(tmp); } catch {} } } // Windows: rename pode falhar se o arquivo estiver aberto
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

// Lê o registro anterior (se corrompido, recomeça) e grava o novo. Lança se não conseguir gravar.
function recordStatus(dir, input, nowMs = Date.now()) {
  const snap = core.parseStatus(input, nowMs);
  if (!snap) throw new Error('entrada inválida');
  fs.mkdirSync(sessionsDir(dir), { recursive: true });
  const file = path.join(sessionsDir(dir), sessionFileName(snap.sessionId));
  let prev = null; try { prev = readJson(file); } catch {}
  const rec = core.updateSessionRecord(prev, snap);
  writeAtomic(file, JSON.stringify(rec));
  return rec;
}

// Nunca lança: arquivo ilegível/corrompido vira item em `errors`; pasta ausente vira lista vazia.
function readSessions(dir) {
  const out = { sessions: [], errors: [] };
  let names;
  try { names = fs.readdirSync(sessionsDir(dir)); }
  catch (e) { if (e.code !== 'ENOENT') out.errors.push({ file: sessionsDir(dir), error: e.code || String(e.message) }); return out; }
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try {
      const r = readJson(path.join(sessionsDir(dir), n));
      if (r && typeof r.sessionId === 'string') out.sessions.push(r); else out.errors.push({ file: n, error: 'formato inválido' });
    } catch (e) { out.errors.push({ file: n, error: e.code || 'JSON inválido' }); }
  }
  return out;
}

module.exports = { defaultDir, sessionsDir, sessionFileName, recordStatus, readSessions, writeAtomic };
