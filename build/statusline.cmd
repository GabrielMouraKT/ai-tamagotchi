@echo off
rem Linha de status do Claude Code para a versao instalada (.exe): roda o statusline.js com o runtime do proprio app,
rem sem precisar de Node.js instalado. Le o JSON do stdin e imprime uma linha. Nao abre janela.
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\AI Tamagotchi.exe" "%~dp0app.asar.unpacked\statusline.js"
