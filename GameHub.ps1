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

function Start-LocalGameHub {
    if (-not (Test-Docker)) {
        return
    }

    Write-Host
    Write-Host "Building and starting GameHub locally..." -ForegroundColor Cyan

    docker compose up --build --detach

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

    docker compose --profile public up --build --detach

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

    Start-Process "http://localhost:3000"

    $publicUrl = $null

    for ($attempt = 1; $attempt -le 30; $attempt += 1) {
        Start-Sleep -Seconds 1

        $tunnelLogs = docker compose logs --tail 100 tunnel 2>&1 |
            Out-String

        $urlMatch = [regex]::Match(
            $tunnelLogs,
            "https://[a-z0-9-]+\.trycloudflare\.com"
        )

        if ($urlMatch.Success) {
            $publicUrl = $urlMatch.Value
            break
        }

        if ($tunnelLogs -match "status 429") {
            break
        }
    }

    Write-Host

    if ($publicUrl) {
        Set-Clipboard $publicUrl

        Write-Host "GameHub is public!" -ForegroundColor Green
        Write-Host
        Write-Host "Host page:"
        Write-Host "http://localhost:3000"
        Write-Host
        Write-Host "Player link:"
        Write-Host $publicUrl -ForegroundColor Yellow
        Write-Host
        Write-Host "The player link was copied to your clipboard."
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