# Como contribuir

Obrigado por querer ajudar! Qualquer pessoa pode contribuir: código, novos mascotes, documentação, traduções, testes ou só ideias e relatos de bugs.

## Formas de ajudar
- 🐞 **Relatar um bug** ou 💡 **sugerir uma ideia:** abra uma [issue](https://github.com/GabrielMouraKT/ai-tamagotchi/issues/new/choose) (há modelos prontos).
- 🦊 **Novo mascote** ou melhoria de animação (rostos diferentes por estado são muito bem-vindos): veja [Adicionar um mascote](#adicionar-um-mascote).
- 🧪 **Mais testes**, principalmente de acoplamento ao terminal em setups diferentes (DPI, vários monitores, Windows 10).
- 🌎 **Traduções** e melhorias na documentação.

## Preparando o ambiente
Precisa de Windows (o acoplamento usa Win32), Node.js 20+ e Git.

```powershell
git clone https://github.com/<seu-usuario>/ai-tamagotchi.git
cd ai-tamagotchi
npm install
npm test            # tudo deve passar antes de mexer
npm run desktop     # abre o app
```
Dica: para testar sem mexer nos seus dados reais, rode com uma pasta de dados de teste: `$env:AI_TAMAGOTCHI_DIR="$env:TEMP\tama-teste"` (a telemetria passa a ser lida/gravada ali) e `--user-data-dir` para as preferências da janela.

## Fluxo de contribuição
1. Faça um **fork** e crie um branch: `git checkout -b minha-melhoria`.
2. Faça mudanças **pequenas e focadas**, com testes quando mudar comportamento.
3. Rode `npm test`. O CI roda os mesmos testes no Windows.
4. Abra o **pull request** explicando o que mudou e por quê (o modelo ajuda). Se mudou a interface, anexe uma captura **sem dados pessoais**.

## Regras do projeto (importantes)
1. **Privacidade primeiro.** Nada de telemetria, chamadas de rede externas, leitura de conversas/arquivos/credenciais. `test/privacy.test.js` garante isso e não deve ser enfraquecido.
2. **Nunca inventar dados.** Sem dado do Claude Code, mostrar "Indisponível" (nunca 0%, nunca horário estimado). Custo é sempre "estimado".
3. **Contexto cheio não é quota.** Só quota de 5 h/7 dias esgotada faz o mascote dormir.
4. **Não sobrescrever configuração do usuário.** O instalador faz backup e só mexe na chave `statusLine`.
5. **Sem dependências desnecessárias.** O runtime (`lib/`, `server.js`, `statusline.js`) usa só Node puro.
6. **Interface sem barra de rolagem** e acessível (rótulos, foco visível, estado nunca só por cor).
7. Texto da interface em **português do Brasil**.

## Estilo de código
JavaScript simples (CommonJS), sem build para o código do app. Funções pequenas, comentários só onde o "porquê" não é óbvio. Lógica pura vai em `lib/` ou `electron/dock-logic.cjs` para poder ser testada com `node --test`.

## Adicionar um mascote
Cada mascote fica em `mascotes/<id>/` e é registrado em `mascots.json`.

1. Arte estática transparente em `assets/<id>.png` e `mascotes/<id>/original.png`.
2. Animações em `mascotes/<id>/animacoes/<estado>/frame_000.png…` e um `manifest.json`. Estados e nº de quadros: `idle` 8, `feliz` 10, `piscar` 6, `triste` 8, `preocupado` 8, `comer_tokens` 10, `dormir` 8, `despertar` 10 (veja `lib/anim.js`).
3. Entrada em `mascots.json` com `id`, `name`, `description`, `emoji`, `src`, `color` (cor de destaque `#rrggbb`) e `background`.
4. `npm test` confere se todos os quadros existem e se o catálogo está consistente.

> Ao enviar arte, ela será licenciada sob a mesma licença MIT do projeto. Envie só arte que você tem direito de liberar.

## Testes
`npm test` (= `node --test "test/*.test.js"`). Cobrem: leitura/normalização da telemetria, humor, sessões e custos, servidor local, instalador, acoplamento e posicionamento, pacote `.exe` e privacidade.

## Gerar o instalador
`npm run dist` cria `dist/AI-Tamagotchi-Setup-<versão>.exe` (NSIS, por usuário). Para publicar: crie uma *Release* no GitHub e anexe o `.exe` (ou use o workflow manual **Release** em *Actions*).

## Código de conduta
Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).
