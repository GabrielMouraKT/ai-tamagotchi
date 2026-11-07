'use strict';
// Comando da statusLine do Claude Code: lê o JSON documentado via stdin, grava o registro da sessão
// e imprime uma linha curta. Não acessa tokens, credenciais, transcrições ou APIs não documentadas.
// Sempre sai com código 0 e imprime algo, mesmo se a gravação falhar.
const core = require('./lib/core'), store = require('./lib/store');

const fmtPct = n => (core.num(n) ? Math.round(n) + '%' : 'n/d');

function renderLine(rec, nowMs) {
  const sec = nowMs / 1000;
  const five = core.effectiveLimit(rec.limits?.fiveHour, sec), week = core.effectiveLimit(rec.limits?.sevenDay, sec);
  const mood = core.computeMood(rec.context?.remainingPct ?? null, five.remainingPct, week.remainingPct);
  const face = { happy: '◕‿◕', sad: '◔_◔', worried: '◉_◉', sleeping: '-_- zzz', unknown: '◉' }[mood];
  const q = l => (l.status === 'unavailable' ? 'n/d' : l.status === 'renewed' ? 'renovada' : fmtPct(l.usedPct) + ' usado');
  return `${face} ${rec.model || 'modelo n/d'} | ctx ${fmtPct(rec.context?.remainingPct)} livre | 5h ${q(five)} | 7d ${q(week)} | ~$${core.num(rec.costUsd) ? rec.costUsd.toFixed(2) : 'n/d'} est.`;
}

function main(raw, nowMs = Date.now()) {
  raw = String(raw).replace(/^﻿/, ''); // PowerShell 5.1 coloca BOM no stdin
  try {
    const rec = store.recordStatus(store.defaultDir(), JSON.parse(raw), nowMs);
    return renderLine(rec, nowMs);
  } catch (err) {
    try { const snap = core.parseStatus(JSON.parse(raw), nowMs); if (snap) return renderLine({ ...snap, limits: snap.limits }, nowMs) + ' | (sem gravar)'; } catch {}
    return '◉ AI Tamagotchi | aguardando telemetria';
  }
}

module.exports = { main, renderLine };

if (require.main === module) {
  let raw = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => { console.log(main(raw)); });
  process.stdin.on('error', () => { console.log('◉ AI Tamagotchi | aguardando telemetria'); });
}
