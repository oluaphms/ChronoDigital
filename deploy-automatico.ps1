# Script para deploy automático no GitHub
# Execute este script quando o Cursor não estiver criando locks

Write-Host "🚀 Deploy Automático para GitHub" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

Set-Location "D:\APP Smartponto"

# Desabilitar proxy
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null

# Função para tentar operação Git com retry
function Invoke-GitOperation {
    param(
        [string]$Operation,
        [int]$MaxRetries = 10,
        [int]$DelaySeconds = 1
    )
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        # Remover lock antes de cada tentativa
        if (Test-Path ".git\index.lock") {
            try {
                Remove-Item ".git\index.lock" -Force -ErrorAction Stop
                Start-Sleep -Milliseconds 500
            } catch {
                # Continuar mesmo se não conseguir remover
            }
        }
        
        if (Test-Path ".git\config.lock") {
            try {
                Remove-Item ".git\config.lock" -Force -ErrorAction Stop
                Start-Sleep -Milliseconds 500
            } catch {
                # Continuar mesmo se não conseguir remover
            }
        }
        
        # Executar operação
        $output = Invoke-Expression "git $Operation" 2>&1
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            return @{ Success = $true; Output = $output }
        }
        
        # Se não for erro de lock, retornar erro imediatamente
        if ($output -notmatch "lock" -and $output -notmatch "File exists") {
            return @{ Success = $false; Output = $output }
        }
        
        if ($i -lt $MaxRetries) {
            Write-Host "   Tentativa $i/$MaxRetries falhou, aguardando ${DelaySeconds}s..." -ForegroundColor Yellow
            Start-Sleep -Seconds $DelaySeconds
        }
    }
    
    return @{ Success = $false; Output = "Falhou após $MaxRetries tentativas" }
}

# 1. Adicionar arquivos
Write-Host "`n📦 Adicionando arquivos modificados..." -ForegroundColor Yellow
$result = Invoke-GitOperation "add components/Layout.tsx components/PunchModal.tsx"

if (-not $result.Success) {
    Write-Host "❌ Erro ao adicionar arquivos:" -ForegroundColor Red
    Write-Host $result.Output -ForegroundColor Red
    Write-Host "`n💡 Solução: Use a interface do Cursor (Ctrl+Shift+G) para adicionar os arquivos manualmente" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Arquivos adicionados" -ForegroundColor Green

# 2. Verificar status
Write-Host "`n📊 Status:" -ForegroundColor Yellow
git status --short

# 3. Fazer commit
Write-Host "`n💾 Fazendo commit..." -ForegroundColor Yellow
$commitMessage = "fix: corrigir funcionalidade de foto e alterar Chronos para SmartPonto

- Corrigir captura de foto no PunchModal com validações melhoradas
- Melhorar inicialização da câmera com tratamento de erros
- Alterar texto 'Chronos' para 'SmartPonto' no header mobile
- Adicionar validações e feedback visual no botão da câmera"

$result = Invoke-GitOperation "commit -m `"$commitMessage`""

if (-not $result.Success) {
    Write-Host "❌ Erro ao fazer commit:" -ForegroundColor Red
    Write-Host $result.Output -ForegroundColor Red
    Write-Host "`n💡 Solução: Use a interface do Cursor (Ctrl+Shift+G) para fazer commit manualmente" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Commit realizado com sucesso!" -ForegroundColor Green

# 4. Push
Write-Host "`n📤 Enviando para GitHub..." -ForegroundColor Yellow
Write-Host "   (Use seu Personal Access Token se pedir credenciais)" -ForegroundColor Gray

$result = Invoke-GitOperation "push origin main"

if ($result.Success) {
    Write-Host "`n✅ Sucesso! Alterações enviadas para GitHub." -ForegroundColor Green
    Write-Host "🔗 https://github.com/oluaphms/APP-Smartponto" -ForegroundColor Cyan
    Write-Host "`n🚀 Deploy concluído! O Vercel deve fazer o deploy automaticamente." -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Erro no push:" -ForegroundColor Yellow
    Write-Host $result.Output -ForegroundColor Yellow
    Write-Host "`n💡 Soluções possíveis:" -ForegroundColor Yellow
    Write-Host "   1. Configure um Personal Access Token: https://github.com/settings/tokens" -ForegroundColor White
    Write-Host "   2. Use a interface do Cursor (Ctrl+Shift+G) > Sync Changes" -ForegroundColor White
    Write-Host "   3. Execute este script novamente em alguns segundos" -ForegroundColor White
}

Write-Host "`n✨ Processo concluído!" -ForegroundColor Green
