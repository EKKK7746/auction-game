@echo off
cd /d "%~dp0"
:loop
echo [%time%] 启动马王堆服务器...
"C:\Users\24344\.workbuddy\binaries\node\versions\22.22.2\node.exe" index.js
echo [%time%] 服务器已退出，3秒后重启...
timeout /t 3 /nobreak >nul
goto loop
