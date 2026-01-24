# Script para fazer commit e push das alterações
# Execute este script no terminal do Cursor ou PowerShell

Write-Host "🚀 Preparando commit e push..." -ForegroundColor Cyan

Set-Location "D:\APP Smartponto"

# Desabilitar proxy
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null

# Aguardar um pouco para evitar locks
Write-Host "`n⏳ Aguardando..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Remover locks se existirem
if (Test-Path ".git\index.lock") {
    try {
        Remove-Item ".git\index.lock" -Force -ErrorAction Stop
        Write-Host "✅ Lock removido" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Não foi possível remover o lock" -ForegroundColor Yellow
    }
}

# Adicionar arquivos modificados
Write-Host "`n📦 Adicionando arquivos..." -ForegroundColor Yellow
git add components/Layout.tsx components/PunchModal.tsx

# Verificar status
Write-Host "`n📊 Status:" -ForegroundColor Yellow
git status --short

# Fazer commit
Write-Host "`n💾 Fazendo commit..." -ForegroundColor Yellow
$commitMessage = @"
fix: corrigir funcionalidade de foto e alterar Chronos para SmartPonto

- Corrigir captura de foto no PunchModal com validações melhoradas
- Melhorar inicialização da câmera com tratamento de erros
- Alterar texto 'Chronos' para 'SmartPonto' no header mobile
- Adicionar validações e feedback visual no botão da câmera
"@

git commit -m $commitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Commit realizado com sucesso!" -ForegroundColor Green
    
    # Push
    Write-Host "`n📤 Enviando para GitHub..." -ForegroundColor Yellow
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Sucesso! Alterações enviadas para GitHub." -ForegroundColor Green
        Write-Host "🔗 https://github.com/oluaphms/APP-Smartponto" -ForegroundColor Cyan
    } else {
        Write-Host "`n⚠️  Erro no push. Verifique suas credenciais." -ForegroundColor Yellow
    }
} else {
    Write-Host "`n❌ Erro ao fazer commit" -ForegroundColor Red
}

Write-Host "`n✨ Concluído!" -ForegroundColor Green
