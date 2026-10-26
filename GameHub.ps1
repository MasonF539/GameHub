param(
    [ValidateSet("Menu", "Local", "Public", "Status", "Logs", "Stop")]
    [string]$Action = "Menu"
)

function Wait-ForUser {
    Write-Host
    Read-Host "Press Enter to return to the menu"
}

function Test-Docker {
    docker info *> $null

    if ($LASTEXITCODE -ne 0) {
        Write-Host
        Write-Host "Docker Desktop is not running." -ForegroundColor Red
        Write-Host "Open Docker Desktop, wait for it to start, and try again."
        Wait-ForUser
        return $false
    }

    return $true
}

function Wait-ForGameHub {
    Write-Host
    Write-Host "Waiting for the GameHub server..." -ForegroundColor Cyan

    for ($attempt = 1; $attempt -le 40; $attempt += 1) {
        try {
            $response = Invoke-WebRequest `
                -Uri "http://localhost:3000" `
                -UseBasicParsing `
                -TimeoutSec 2

            if ($response.StatusCode -eq 200) {
                return $true
            }
        }
        catch {
            # The server is still starting. Try again shortly.
        }

        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Set-GameHubClipboard {
    param([Parameter(Mandatory = $true)][string]$Value)

    try {
        Set-Clipboard -Value $Value -ErrorAction Stop
        Start-Sleep -Milliseconds 100
        $clipboardValue = [string](Get-Clipboard -Raw -ErrorAction Stop)
        return $clipboardValue.Trim() -eq $Value
    }
    catch {
        return $false
    }
}

function Set-GameHubPublicUrl {
    param([string]$Value = "")
    # Share tunnel discovery with the server without routing the host through it.
    docker compose exec -T gamehub node -e "require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(), 'gamehub-public-url'), process.argv[1] ?? '')" $Value
    return $LASTEXITCODE -eq 0
}

function Start-LocalGameHub {
    if (-not (Test-Docker)) {
        return
    }

    Write-Host
    Write-Host "Building and starting GameHub locally..." -ForegroundColor Cyan

    docker compose --profile public stop tunnel

    if ($LASTEXITCODE -ne 0) {
        Write-Host "The public tunnel could not be stopped. Local mode was not started." -ForegroundColor Red
        Wait-ForUser
        return
    }

    docker compose up --build --detach gamehub

    if ($LASTEXITCODE -ne 0) {
        Write-Host
        Write-Host "GameHub could not start." -ForegroundColor Red
        Wait-ForUser
        return
    }

    if (-not (Wait-ForGameHub)) {
        Write-Host
        Write-Host "GameHub did not become ready in time." -ForegroundColor Red
        Write-Host
        docker compose logs --tail 30 gamehub
        Wait-ForUser
        return
    }

    Set-GameHubPublicUrl | Out-Null
    Start-Process "http://localhost:3000"

    Write-Host
    Write-Host "GameHub is running locally:" -ForegroundColor Green
    Write-Host "http://localhost:3000"

    Wait-ForUser
}

function Start-PublicGameHub {
    if (-not (Test-Docker)) {
        return
    }

    Write-Host
    Write-Host "Building GameHub and requesting a public tunnel..." -ForegroundColor Cyan

    # Behind the tunnel, rate limits should use each visitor's real address.
    $env:GAMEHUB_TRUST_CLOUDFLARE_IP = "true"

    try {
        docker compose --profile public up --build --detach
    }
    finally {
        Remove-Item Env:\GAMEHUB_TRUST_CLOUDFLARE_IP -ErrorAction SilentlyContinue
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host
        Write-Host "GameHub could not start." -ForegroundColor Red
        Wait-ForUser
        return
    }

    if (-not (Wait-ForGameHub)) {
        Write-Host
        Write-Host "GameHub did not become ready in time." -ForegroundColor Red
        Write-Host
        docker compose logs --tail 30 gamehub
        Wait-ForUser
        return
    }

    $publicUrl = $null
    Set-GameHubPublicUrl | Out-Null

    # Resolve the tunnel before opening the browser. Repeated Docker CLI polls
    # can briefly contend with desktop window activation on Windows.
    for ($attempt = 1; $attempt -le 20; $attempt += 1) {
        Start-Sleep -Seconds 2

        $tunnelLogs = docker compose logs --no-color --tail 100 tunnel 2>&1 |
            Out-String

        $urlMatches = [regex]::Matches(
            $tunnelLogs,
            "https://[a-z0-9-]+\.trycloudflare\.com"
        )

        if ($urlMatches.Count -gt 0) {
            $publicUrl = ([string]$urlMatches[$urlMatches.Count - 1].Value).Trim()
            break
        }

        if ($tunnelLogs -match "status 429") {
            break
        }
    }

    Write-Host

    if ($publicUrl) {
        if (-not (Set-GameHubPublicUrl -Value $publicUrl)) {
            Write-Host "Could not register the tunnel address for lobby invites. Share the player link below instead." -ForegroundColor Yellow
        }
        $copiedPublicUrl = Set-GameHubClipboard -Value $publicUrl

        Write-Host "GameHub is public!" -ForegroundColor Green
        Write-Host
        Write-Host "Host page:"
        Write-Host "http://localhost:3000"
        Write-Host
        Write-Host "Player link:"
        Write-Host $publicUrl -ForegroundColor Yellow
        Write-Host
        if ($copiedPublicUrl) {
            Write-Host "The full player link was copied to your clipboard."
        }
        else {
            Write-Host "The player link could not be copied. Copy the yellow link above." -ForegroundColor Yellow
        }

        Start-Process "http://localhost:3000"
    }
    else {
        Write-Host "Cloudflare did not provide a public address." -ForegroundColor Red
        Write-Host
        Write-Host "Recent tunnel messages:"

        docker compose logs --tail 20 tunnel
        docker compose --profile public down
    }

    Wait-ForUser
}

function Show-GameHubStatus {
    if (-not (Test-Docker)) {
        return
    }

    Write-Host
    docker compose --profile public ps
    Wait-ForUser
}

function Show-GameHubLogs {
    if (-not (Test-Docker)) {
        return
    }

    Write-Host
    docker compose --profile public logs --tail 50
    Wait-ForUser
}

function Stop-GameHub {
    if (-not (Test-Docker)) {
        return
    }

    Write-Host
    Write-Host "Stopping GameHub..." -ForegroundColor Cyan

    docker compose --profile public down

    if ($LASTEXITCODE -ne 0) {
        Write-Host "GameHub could not be stopped. Check the Docker messages above." -ForegroundColor Red
        Wait-ForUser
        return
    }

    Write-Host
    Write-Host "GameHub has stopped." -ForegroundColor Green
    Wait-ForUser
}

Set-Location $PSScriptRoot

switch ($Action) {
    "Local" {
        Start-LocalGameHub
        exit
    }

    "Public" {
        Start-PublicGameHub
        exit
    }

    "Status" {
        Show-GameHubStatus
        exit
    }

    "Logs" {
        Show-GameHubLogs
        exit
    }

    "Stop" {
        Stop-GameHub
        exit
    }
}

do {
    Clear-Host

    Write-Host "==============================" -ForegroundColor Magenta
    Write-Host "       GameHub Controls       " -ForegroundColor Magenta
    Write-Host "==============================" -ForegroundColor Magenta
    Write-Host
    Write-Host "1. Start locally"
    Write-Host "2. Start publicly"
    Write-Host "3. Show status"
    Write-Host "4. Show recent logs"
    Write-Host "5. Stop GameHub"
    Write-Host "Q. Exit controls"
    Write-Host

    $choice = Read-Host "Choose an option"

    switch ($choice.ToUpper()) {
        "1" {
            Start-LocalGameHub
        }

        "2" {
            Start-PublicGameHub
        }

        "3" {
            Show-GameHubStatus
        }

        "4" {
            Show-GameHubLogs
        }

        "5" {
            Stop-GameHub
        }

        "Q" {
            Write-Host
            Write-Host "Closing GameHub controls."
        }

        default {
            Write-Host
            Write-Host "That is not a valid option." -ForegroundColor Yellow
            Start-Sleep -Seconds 1
        }
    }
}
while ($choice.ToUpper() -ne "Q")
