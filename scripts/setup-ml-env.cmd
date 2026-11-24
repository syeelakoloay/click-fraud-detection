@echo off
setlocal
cd /d "%~dp0.."

echo [ClickGuard] Menyiapkan Python virtual environment tanpa aktivasi PowerShell...

if not exist "backend\.venv\Scripts\python.exe" (
    where py >nul 2>nul
    if not errorlevel 1 (
        py -3 -m venv "backend\.venv"
    ) else (
        where python >nul 2>nul
        if errorlevel 1 (
            echo [ERROR] Python tidak ditemukan. Install Python 3 lalu buka terminal baru.
            exit /b 1
        )
        python -m venv "backend\.venv"
    )
    if errorlevel 1 (
        echo [ERROR] Pembuatan virtual environment gagal.
        exit /b 1
    )
)

"backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 exit /b 1

"backend\.venv\Scripts\python.exe" -m pip install -r "backend\ml\requirements.txt"
if errorlevel 1 exit /b 1

echo.
echo [OK] Environment Python siap.
echo Jalankan scripts\start-ml-api.cmd untuk memulai layanan ML.
exit /b 0
