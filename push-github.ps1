# Script para enviar alterações para o GitHub
# Resolve problemas de proxy e credenciais

Write-Host "🚀 Enviando alterações para GitHub..." -ForegroundColor Cyan

# Mudar para o diretório do projeto
Set-Location "D:\APP Smartponto"

# Desabilitar proxy
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null
$env:NO_PROXY = "*"
$env:no_proxy = "*"

Write-Host "✅ Proxy desabilitado" -ForegroundColor Green

# Remover locks do Git
Write-Host "`n🔓 Removendo locks do Git..." -ForegroundColor Yellow
Stop-Process -Name "git*" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

if (Test-Path ".git\index.lock") {
    try {
        Remove-Item ".git\index.lock" -Force -ErrorAction Stop
        Write-Host "✅ Lock removido" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Não foi possível remover o lock automaticamente" -ForegroundColor Yellow
        Write-Host "   Feche outros processos Git e remova manualmente: .git\index.lock" -ForegroundColor Gray
    }
}

if (Test-Path ".git\config.lock") {
    try {
        Remove-Item ".git\config.lock" -Force -ErrorAction Stop
        Write-Host "✅ Config lock removido" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Não foi possível remover o config lock" -ForegroundColor Yellow
    }
}

# Verificar status
Write-Host "`n📋 Verificando status..." -ForegroundColor Cyan
git status

# Adicionar arquivos se houver alterações
Write-Host "`n📦 Adicionando arquivos..." -ForegroundColor Cyan
$status = git status --porcelain
if ($status) {
    git add -A
    Write-Host "✅ Arquivos adicionados" -ForegroundColor Green
    
    # Fazer commit
    Write-Host "`n💾 Fazendo commit..." -ForegroundColor Cyan
    $commitMessage = "feat: atualizações do projeto SmartPonto"
    git commit -m $commitMessage
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro ao fazer commit" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Commit realizado" -ForegroundColor Green
} else {
    Write-Host "✅ Nenhuma alteração para commitar" -ForegroundColor Green
}

# Tentar push
Write-Host "`n📤 Enviando para GitHub..." -ForegroundColor Cyan
Write-Host "   (Se pedir credenciais, use seu username e Personal Access Token)" -ForegroundColor Gray
Write-Host "   Para criar um token: https://github.com/settings/tokens" -ForegroundColor Gray

# Configurar Git para pedir credenciais
git config --local credential.helper manager-core 2>$null

# Tentar push
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Sucesso! Alterações enviadas para GitHub." -ForegroundColor Green
    Write-Host "🔗 https://github.com/oluaphms/APP-Smartponto" -ForegroundColor Cyan
} else {
    Write-Host "`n❌ Erro ao enviar para GitHub" -ForegroundColor Red
    Write-Host "`n💡 Soluções possíveis:" -ForegroundColor Yellow
    Write-Host "   1. Configure um Personal Access Token:" -ForegroundColor White
    Write-Host "      https://github.com/settings/tokens" -ForegroundColor Gray
    Write-Host "   2. Use SSH em vez de HTTPS:" -ForegroundColor White
    Write-Host "      git remote set-url origin git@github.com:oluaphms/APP-Smartponto.git" -ForegroundColor Gray
    Write-Host "   3. Execute este script como Administrador" -ForegroundColor White
    exit 1
}

Write-Host "`n✨ Concluído!" -ForegroundColor Green
