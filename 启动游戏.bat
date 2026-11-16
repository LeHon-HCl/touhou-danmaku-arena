@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ============================================================
rem  双击这个文件即可开始游戏（Windows）
rem  它会：检查依赖 -> 启动开发服务器 -> 自动打开浏览器
rem  游戏运行期间请不要关掉弹出的那个黑色窗口
rem ============================================================

if not exist "node_modules" (
  echo [首次运行] 正在安装依赖，可能需要 1-3 分钟...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败。请确认已安装 Node.js（https://nodejs.org）。
    pause
    exit /b 1
  )
)

rem 判断开发服务器是否已经在跑（已经在跑就不要重复启动，否则会端口冲突）
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo 正在启动开发服务器...
  start "TDA 游戏服务器（关掉这个窗口就停止游戏）" cmd /k "cd /d "%~dp0" && npm.cmd run dev"
  echo 等待服务器就绪...
  timeout /t 5 >nul
) else (
  echo 开发服务器已在运行，直接打开浏览器...
)

start "" "http://localhost:5173"
exit /b 0
