# Script para enviar alterações para APP-Smartponto
# Funciona mesmo com o Cursor aberto

Write-Host "🚀 Enviando alterações para APP-Smartponto..." -ForegroundColor Cyan

# Mudar para o diretório do projeto
Set-Location "D:\APP Smartponto"

# Desabilitar proxy
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null

# Função para tentar operação Git com retry
function Invoke-GitWithRetry {
    param(
        [string]$Command,
        [int]$MaxRetries = 5,
        [int]$DelaySeconds = 2
    )
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        # Remover lock antes de cada tentativa
        if (Test-Path ".git\index.lock") {
            try {
                Remove-Item ".git\index.lock" -Force -ErrorAction Stop
            } catch {
                # Ignorar erro se não conseguir remover
            }
        }
        
        Start-Sleep -Milliseconds 500
        
        # Executar comando
        $output = Invoke-Expression "git $Command" 2>&1
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            return $output
        }
        
        # Se não for erro de lock, retornar erro imediatamente
        if ($output -notmatch "lock" -and $output -notmatch "File exists") {
            Write-Error $output
            return $output
        }
        
        if ($i -lt $MaxRetries) {
            Write-Host "   Tentativa $i/$MaxRetries falhou, aguardando ${DelaySeconds}s..." -ForegroundColor Yellow
            Start-Sleep -Seconds $DelaySeconds
        }
    }
    
    Write-Error "Falhou após $MaxRetries tentativas: $output"
    return $output
}

# Verificar status
Write-Host "`n📋 Verificando status..." -ForegroundColor Yellow
git status

# Adicionar arquivos
Write-Host "`n📦 Adicionando arquivos..." -ForegroundColor Yellow
$addResult = Invoke-GitWithRetry "add -A"

# Verificar se há algo para commitar
Write-Host "`n📊 Status após adicionar:" -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host $status -ForegroundColor Gray
    
    # Fazer commit
    Write-Host "`n💾 Fazendo commit..." -ForegroundColor Yellow
    $commitResult = Invoke-GitWithRetry "commit -m 'feat: atualizações do projeto SmartPonto'"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Commit realizado" -ForegroundColor Green
    }
} else {
    Write-Host "✅ Nenhuma alteração para commitar" -ForegroundColor Green
}

# Push
Write-Host "`n📤 Enviando para GitHub..." -ForegroundColor Yellow
Write-Host "   (Use seu Personal Access Token se pedir credenciais)" -ForegroundColor Gray
Write-Host ""

git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Sucesso! Alterações enviadas para GitHub." -ForegroundColor Green
    Write-Host "🔗 https://github.com/oluaphms/APP-Smartponto" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠️  Push pode ter falhado. Verifique:" -ForegroundColor Yellow
    Write-Host "   - Credenciais (use Personal Access Token)" -ForegroundColor Gray
    Write-Host "   - Conexão com internet" -ForegroundColor Gray
    Write-Host "   - Permissões no repositório" -ForegroundColor Gray
}

Write-Host "`n✨ Concluído!" -ForegroundColor Green
