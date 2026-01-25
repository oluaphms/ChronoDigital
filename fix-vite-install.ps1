# Script para corrigir instalação do Vite
Write-Host "Corrigindo instalação do Vite..." -ForegroundColor Yellow

# Parar processos que possam estar bloqueando
Write-Host "`nParando processos Node.js..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Limpar cache do npm
Write-Host "`nLimpando cache do npm..." -ForegroundColor Cyan
npm cache clean --force 2>$null

# Remover node_modules e package-lock.json
Write-Host "`nRemovendo node_modules e package-lock.json..." -ForegroundColor Cyan
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue
}

# Instalar dependências
Write-Host "`nInstalando dependências..." -ForegroundColor Cyan
npm install

# Verificar se Vite foi instalado
if (Test-Path "node_modules\vite") {
    Write-Host "`n✓ Vite instalado com sucesso!" -ForegroundColor Green
    Write-Host "`nTente executar: npm run build" -ForegroundColor Yellow
} else {
    Write-Host "`n✗ Vite não foi instalado. Tente executar como Administrador." -ForegroundColor Red
}
