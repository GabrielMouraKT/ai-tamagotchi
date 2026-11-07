# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [0.4.0] — 2026-11-07
Primeira versão pública.

### Adicionado
- App de desktop (Electron) sem navegador: janela sem borda, arrastável, redimensionável (mín. 330×490), sem barra de rolagem, posição e tamanho salvos.
- Gruda ao Windows Terminal e ao console CMD/PowerShell (helper Win32): fixa no terminal escolhido, acompanha mover/redimensionar, alterna para a esquerda sem espaço, desgruda ao arrastar o mascote; escolha de terminal (▾) persistente.
- 18 mascotes com paleta própria, animação quadro a quadro (8 estados) e efeitos por humor; galeria paginada com busca.
- Telemetria real pela `statusLine` oficial do Claude Code: contexto, janela de 5 h, limite de 7 dias, modelo, custo **estimado**, várias sessões sem contar duas vezes, ETA apenas com `resets_at` informado.
- Botão **Conectar ao Claude Code** (merge só da chave `statusLine`, com backup, sem sobrescrever) e instalador `.exe` por usuário.
- Tela **Privacidade** e testes automáticos que garantem: sem rede externa, sem credenciais, só campos de telemetria gravados.
- 76 testes automatizados.

### Limitações conhecidas
- Instalador sem assinatura digital (aviso do SmartScreen).
- Acoplar só suporta Windows Terminal e console clássico; borda colorida exige Windows 11; sem testes em escalas de DPI ≠ 100% nem no Windows 10.
- As animações usam o mesmo rosto base do PNG original em todos os estados (a expressão por estado vem de efeitos e postura).
