@echo off
chcp 65001 > nul
title منصة حياه الطبية
cd /d "%~dp0"

echo ==============================================
echo       🏥 جاري تشغيل منصة حياه الطبية...
echo ==============================================
echo.

:: فحص ما إذا كان السيرفر يعمل بالفعل على البورت 5000
netstat -ano | findstr ":5000 " | findstr "LISTENING" > nul
if %errorlevel% equ 0 (
    echo [✓] السيرفر يعمل بالفعل بنجاح!
) else (
    echo [✓] جاري تشغيل السيرفر بالخلفية...
    start /min "Haya Server" node server.js
    timeout /t 2 /nobreak > nul
)

echo [✓] فتح المتصفح على الرابط المباشر...
start http://localhost:5000/index.html

echo.
echo ==============================================
echo   تم التشغيل بنجاح! الرابط: http://localhost:5000
echo ==============================================
timeout /t 3 > nul
exit
