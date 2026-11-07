# Segurança

## Versões com suporte
Recebe correções a versão mais recente publicada em [Releases](https://github.com/GabrielMouraKT/ai-tamagotchi/releases).

## Como reportar uma vulnerabilidade
**Não abra uma issue pública** para falhas de segurança. Use o relato privado do GitHub:
👉 [Reportar uma vulnerabilidade](https://github.com/GabrielMouraKT/ai-tamagotchi/security/advisories/new)

Inclua: o que acontece, como reproduzir, a versão e o impacto que você imagina. Vamos responder assim que possível e creditar você na correção, se quiser.

## O que consideramos importante
- Qualquer caminho para o app **ler ou enviar** dados do usuário além do documentado na tela *Privacidade*.
- Execução de código a partir de dados externos (por exemplo, um JSON de statusLine malicioso).
- Escrita fora das pastas esperadas (`~/.claude/ai-tamagotchi`, dados do app) ou alteração do `settings.json` do Claude Code além da chave `statusLine`.
- Acesso ao servidor local (`127.0.0.1`) por outras origens ou máquinas.

## Modelo de ameaça resumido
O app só escuta em `127.0.0.1`, rejeita `Host` externo, serve apenas arquivos de uma lista fixa, não faz chamadas de rede externas e roda a janela com `contextIsolation`, `sandbox` e uma lista fechada de ações IPC. O helper do Windows lê apenas classe, título, PID e posição das janelas de terminal.

O instalador `.exe` **ainda não é assinado digitalmente**; confira a origem (esta página de Releases) e, se preferir, compile você mesmo (`npm run dist`).
