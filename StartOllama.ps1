# StartOllama.ps1
# سكريبت لتشغيل Ollama مع موديل gpt-oss:20b

Write-Host "🚀 جاري تشغيل Ollama server..." -ForegroundColor Cyan

# تشغيل ollama serve في الخلفية
Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden

Write-Host "⏳ انتظار حتى يبدأ الـ server..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# التحقق إن الـ server شتغل
$health = $null
try {
    $health = Invoke-WebRequest -Uri "http://localhost:11434" -UseBasicParsing -TimeoutSec 5
} catch {}

if ($health -and $health.StatusCode -eq 200) {
    Write-Host "✅ Ollama server يعمل بنجاح!" -ForegroundColor Green
} else {
    Write-Host "⚠️ الـ server ممكن يكون لسه بيبدأ..." -ForegroundColor Yellow
}

# التحقق هل الموديل موجود محليًا
Write-Host "🔍 جاري التحقق من الموديل gpt-oss:20b..." -ForegroundColor Cyan
$modelList = & ollama list 2>&1

if ($modelList -match "gpt-oss") {
    Write-Host "✅ الموديل موجود محليًا" -ForegroundColor Green
} else {
    Write-Host "📥 الموديل مش موجود، جاري التحميل..." -ForegroundColor Yellow
    ollama pull gpt-oss:20b
}

Write-Host ""
Write-Host "💬 جاري تشغيل الموديل... (اكتب /bye للخروج)" -ForegroundColor Green
Write-Host ""

# تشغيل الموديل - الأمر الصحيح
ollama run gpt-oss:20b
