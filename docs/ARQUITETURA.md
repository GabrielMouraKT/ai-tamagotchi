# Arquitetura

Visão geral para quem quer entender ou contribuir.

```
Claude Code ──(stdin JSON, interface oficial statusLine)──▶ statusline.js
                                                              │ grava 1 arquivo por sessão
                                                              ▼
                              ~/.claude/ai-tamagotchi/sessions/<session_id>.json
                                                              ▲ lê
Janela Electron ◀── http://127.0.0.1:<porta livre> ◀── server.js (no mesmo processo)
   (index.html + app.js + lib/core.js + lib/anim.js)
        ▲ IPC (lista fechada de ações)
electron/main.cjs ◀── JSON ◀── electron/follow-terminal.ps1 (Win32: só classe, título, PID e posição)
```

## Fluxo de dados (telemetria)
1. O Claude Code executa o comando configurado em `statusLine` a cada evento e envia um JSON no **stdin**.
2. `statusline.js` usa `lib/core.js` (`parseStatus`) para extrair **somente** modelo, contexto, limites, custo estimado e `session_id`; `lib/store.js` grava um arquivo por sessão (sem corrida entre instâncias) e imprime uma linha curta.
3. O servidor local (`server.js`) devolve as sessões em `GET /api/state`. O painel monta a visão com `TamaCore.buildView` e atualiza a cada segundo (a contagem regressiva é calculada no cliente).

## Módulos
| Arquivo | Papel |
|---|---|
| `lib/core.js` | Lógica **pura** (navegador e Node): normalização, humor, limites/ETA, agregação de sessões, custo por modelo sem dupla contagem. |
| `lib/anim.js` | Estados de animação, caminhos dos quadros PNG, prioridade (despertar > comer > piscar > repouso). |
| `lib/store.js` | Persistência local (1 JSON por sessão, escrita atômica, leitura tolerante a arquivos ruins). |
| `lib/installer.js` | Mescla só a chave `statusLine` em `~/.claude/settings.json` (backup, nunca sobrescreve). Usado pelo CLI e pelo botão **Conectar**. |
| `server.js` | Servidor `127.0.0.1`: lista fixa de arquivos, rejeita `Host` externo. |
| `electron/main.cjs` | Janela, preferências, acoplamento, IPC; sobe o servidor no próprio processo. |
| `electron/dock-logic.cjs` | Lógica **pura** do acoplamento (escolha do terminal, posição à direita/esquerda, limites da janela). |
| `electron/follow-terminal.ps1` | Helper Win32 (DPI v2): lista janelas de terminal. Não lê conteúdo. |
| `app.js`, `index.html`, `style.css`, `desktop-ui.js` | Interface. |
| `build/` | Ícone (Foguinho) e `statusline.cmd` (versão instalada, sem Node). |

## Decisões importantes
- **Contexto cheio ≠ quota.** O mascote só dorme com quota de 5 h/7 dias esgotada.
- **Nunca inventar:** sem dado → "Indisponível"; ETA só com `resets_at`; custo sempre "estimado".
- **Limites são da conta**, não da sessão: vale o evento mais recente entre todas as sessões.
- **Passou o reset** → a janela vira "renovada" (sem % inventado) e o mascote acorda.
- **Terminal fixado por `hwnd`:** ao grudar, segue aquela janela mesmo que o foco mude; se fechar, não pula para outra.
- **Versão instalada:** o `statusline.js` roda com o runtime do próprio app (`ELECTRON_RUN_AS_NODE`), por isso o instalador leva um `package.json` CommonJS fora do `asar` (evita herdar `"type":"module"` de pastas do usuário).

## Testes
`npm test` roda `test/*.test.js` com o runner nativo do Node. Destaques: `privacy.test.js` (sem rede externa/credenciais, só campos de telemetria gravados), `dock.test.js` (posicionamento e escolha de terminal), `anim.test.js` (todos os quadros existem), `integration.test.js` (statusline → arquivos → servidor), `packaging.test.js` (regras do `.exe`).

## Empacotar
`npm run dist` usa o `electron-builder` (NSIS, por usuário, sem administrador). O helper PowerShell, o `statusline.js` e o `package.json` ficam em `app.asar.unpacked`. O instalador **não é assinado**.
