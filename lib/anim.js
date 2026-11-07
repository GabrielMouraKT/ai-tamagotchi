'use strict';
// Animação quadro a quadro (PNG por quadro em mascotes/<id>/animacoes/<estado>/). Puro: roda no navegador e nos testes.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TamaAnim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const COUNTS = { idle: 8, feliz: 10, piscar: 6, triste: 8, preocupado: 8, comer_tokens: 10, dormir: 8, despertar: 10 };
  const STATES = Object.keys(COUNTS);
  const ONE_SHOT = new Set(['piscar', 'comer_tokens', 'despertar']); // tocam uma vez e voltam ao estado base
  // Base = fps dos manifest.json (3,8 e 6,7). Ajuste por humor: preocupado mais agitado, triste mais lento.
  const frameMs = state => ({ dormir: 263, preocupado: 105, triste: 200 }[state] || 149);
  const durationMs = state => COUNTS[state] * frameMs(state);
  const isOneShot = state => ONE_SHOT.has(state);

  const framePath = (mascotId, state, i) => {
    if (!/^[a-z0-9_-]+$/i.test(mascotId) || !(state in COUNTS)) return null;
    const n = COUNTS[state]; const k = ((Math.floor(i) % n) + n) % n;
    return `mascotes/${mascotId}/animacoes/${state}/frame_${String(k).padStart(3, '0')}.png`;
  };

  // Humor -> animação base. Contexto cheio nunca vira "dormir": isso só vem de quota esgotada (mood 'sleeping').
  const baseState = mood => ({ happy: 'feliz', sad: 'triste', worried: 'preocupado', sleeping: 'dormir', unknown: 'idle' }[mood] || 'idle');

  // Variação no estado feliz: alterna feliz/idle em blocos (o piscar é disparado à parte, uma vez).
  function restingState(mood, nowMs) {
    const base = baseState(mood);
    if (mood === 'happy' && Math.floor(nowMs / 7000) % 3 === 2) return 'idle';
    return base;
  }

  // Prioridade: despertar > ação (comer tokens) > estado de repouso.
  function chooseState({ mood, nowMs, wakeUntil = 0, actionName = null, actionUntil = 0, blinkUntil = 0 }) {
    if (wakeUntil > nowMs) return 'despertar';
    if (actionName && actionUntil > nowMs) return actionName;
    if (blinkUntil > nowMs && (mood === 'happy' || mood === 'unknown')) return 'piscar';
    return restingState(mood, nowMs);
  }

  return { COUNTS, STATES, frameMs, durationMs, isOneShot, framePath, baseState, restingState, chooseState };
});
