@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ============================================================
rem  联机对战需要先启动服务端（房间号固定为 test）
rem  用法：先双击本文件，再双击「启动游戏.bat」，大厅里选「联机对战」
rem  这个窗口需要一直开着；关掉它联机就断了
rem ============================================================

if not exist "node_modules" (
  echo [首次运行] 正在安装依赖，可能需要 1-3 分钟...
  call npm.cmd install
)

call npm.cmd run server
pause
