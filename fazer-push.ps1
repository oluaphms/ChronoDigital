# Script simples para fazer push no GitHub
# Execute este script DEPOIS de fechar o Cursor/VS Code

Write-Host "🚀 Enviando alterações para GitHub..." -ForegroundColor Cyan

# Mudar para o diretório do projeto
Set-Location "D:\APP Smartponto"

# Desabilitar proxy
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null

# Remover locks
if (Test-Path ".git\index.lock") {
    Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
}
if (Test-Path ".git\config.lock") {
    Remove-Item ".git\config.lock" -Force -ErrorAction SilentlyContinue
}

# Adicionar arquivos
Write-Host "`n📦 Adicionando arquivos..." -ForegroundColor Yellow
git add -A

# Verificar se há algo para commitar
$status = git status --porcelain
if ($status) {
    Write-Host "`n💾 Fazendo commit..." -ForegroundColor Yellow
    git commit -m "feat: atualizações do projeto SmartPonto"
} else {
    Write-Host "`n✅ Nenhuma alteração para commitar" -ForegroundColor Green
}

# Push
Write-Host "`n📤 Enviando para GitHub..." -ForegroundColor Yellow
Write-Host "   Quando pedir credenciais:" -ForegroundColor Gray
Write-Host "   - Username: seu-usuario-github" -ForegroundColor Gray
Write-Host "   - Password: seu-personal-access-token" -ForegroundColor Gray
Write-Host "   Criar token: https://github.com/settings/tokens" -ForegroundColor Gray
Write-Host ""

git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Sucesso! Alterações enviadas." -ForegroundColor Green
} else {
    Write-Host "`n❌ Erro ao enviar. Verifique suas credenciais." -ForegroundColor Red
}
