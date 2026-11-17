@echo off
setlocal
if /i "%~1"=="painel" goto painel
if /i "%~1"=="app" goto app

where node >nul 2>&1
if errorlevel 1 goto sem_node
where npm >nul 2>&1
if errorlevel 1 goto sem_node

start "Painel da frota" "%ComSpec%" /k ""%~f0" painel"
start "Aplicativo dos motoristas" "%ComSpec%" /k ""%~f0" app"
exit /b 0

:painel
title Painel da frota
cd /d "%~dp0dashboard-frota"
if errorlevel 1 goto erro
if not exist "node_modules\vite\bin\vite.js" (
    echo Instalando dependencias do painel...
    call npm ci
    if errorlevel 1 goto erro
)
echo Painel: http://127.0.0.1:3210/
echo Para encerrar, pressione Ctrl+C nesta janela.
call npm run dev -- --host 0.0.0.0 --port 3210 --strictPort
if errorlevel 1 goto erro
exit /b 0

:app
title Aplicativo dos motoristas
cd /d "%~dp0frota-app"
if errorlevel 1 goto erro
if not exist "node_modules\expo\bin\cli" (
    echo Instalando dependencias do aplicativo...
    call npm ci
    if errorlevel 1 goto erro
)
echo Motorista no navegador deste computador: http://localhost:8081/
echo Na mesma rede, use o IP deste computador com a porta 8081.
echo Para instalar no Android, use o arquivo apk\Frota-Junco.apk na pasta frota-app.
echo Para encerrar, pressione Ctrl+C nesta janela.
call npm run web -- --lan --port 8081
if errorlevel 1 goto erro
exit /b 0

:sem_node
echo ERRO: instale o Node.js com npm e abra este arquivo novamente.
pause
exit /b 1

:erro
echo.
echo Nao foi possivel iniciar o projeto. Confira a mensagem acima.
pause
exit /b 1
