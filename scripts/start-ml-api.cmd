@echo off
setlocal
cd /d "%~dp0.."

if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment belum tersedia.
    echo Jalankan scripts\setup-ml-env.cmd terlebih dahulu.
    exit /b 1
)

echo [ClickGuard] Menjalankan Python ML API pada http://127.0.0.1:8000
"backend\.venv\Scripts\python.exe" "backend\ml\prediction_api.py"
