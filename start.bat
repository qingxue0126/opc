@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js
  echo 请先安装: https://nodejs.org
  pause
  exit /b 1
)

echo 正在启动 OPC 仪表盘...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do (
  echo 端口 8080 已被占用，结束进程 %%p
  taskkill /F /PID %%p >nul 2>nul
)

REM 后台延迟打开浏览器；本窗口只跑服务（关掉即停止）
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://127.0.0.1:8080/app"

echo.
echo 地址: http://127.0.0.1:8080/app
echo 请保持本窗口开启，关闭后服务会停止。
echo.
node server.js
echo.
echo 服务已退出。
pause