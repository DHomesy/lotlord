param(
  [string]$BaseUrl = $env:SPRINT_D_BASE_URL,
  [string]$Token = $env:SPRINT_D_BEARER_TOKEN,
  [string]$OwnerQaSessionId = $env:SPRINT_D_OWNER_QA_SESSION_ID,
  [string]$ConversationId = $env:SPRINT_D_CONVERSATION_ID,
  [int]$Samples = 20,
  [int]$BurstCount = 25,
  [string]$OutputPath = "artifacts/sprint-d-staging-signoff.json"
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  throw 'BaseUrl is required. Provide -BaseUrl or set SPRINT_D_BASE_URL.'
}
if ([string]::IsNullOrWhiteSpace($Token)) {
  throw 'Token is required. Provide -Token or set SPRINT_D_BEARER_TOKEN.'
}

$headers = @{ Authorization = "Bearer $Token" }

function Invoke-TimedRequest {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [object]$Body = $null
  )

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    if ($null -ne $Body) {
      $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 8) -ContentType 'application/json'
    } else {
      $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
    }
    $sw.Stop()
    return [PSCustomObject]@{
      ok = $true
      ms = [math]::Round($sw.Elapsed.TotalMilliseconds, 2)
      response = $resp
      error = $null
    }
  } catch {
    $sw.Stop()
    return [PSCustomObject]@{
      ok = $false
      ms = [math]::Round($sw.Elapsed.TotalMilliseconds, 2)
      response = $null
      error = $_.Exception.Message
    }
  }
}

function Get-Percentile {
  param([double[]]$Values, [double]$Percentile)
  if (-not $Values -or $Values.Count -eq 0) { return $null }
  $sorted = $Values | Sort-Object
  $index = [math]::Ceiling(($Percentile / 100.0) * $sorted.Count) - 1
  if ($index -lt 0) { $index = 0 }
  if ($index -ge $sorted.Count) { $index = $sorted.Count - 1 }
  return [math]::Round([double]$sorted[$index], 2)
}

function Summarize {
  param([object[]]$Rows)
  $latencies = @($Rows | Where-Object { $_.ok } | ForEach-Object { [double]$_.ms })
  [PSCustomObject]@{
    samples = $Rows.Count
    success = (@($Rows | Where-Object { $_.ok })).Count
    failure = (@($Rows | Where-Object { -not $_.ok })).Count
    avgMs = if ($latencies.Count -gt 0) { [math]::Round((($latencies | Measure-Object -Average).Average), 2) } else { $null }
    p50Ms = Get-Percentile -Values $latencies -Percentile 50
    p95Ms = Get-Percentile -Values $latencies -Percentile 95
    maxMs = if ($latencies.Count -gt 0) { [math]::Round((($latencies | Measure-Object -Maximum).Maximum), 2) } else { $null }
  }
}

$dashboardRows = @()
$qualityRows = @()
$portalSnapshotRows = @()
$sessionSnapshotRows = @()
$conversationActionRows = @()

Write-Host "[signoff] Sampling analytics endpoints ($Samples requests each)..."
for ($i = 1; $i -le $Samples; $i++) {
  $dashboardRows += Invoke-TimedRequest -Method 'GET' -Url "$BaseUrl/api/v1/analytics/dashboard" -Headers $headers
  $qualityRows += Invoke-TimedRequest -Method 'GET' -Url "$BaseUrl/api/v1/analytics/owner-qa-quality?days=30" -Headers $headers
}

Write-Host "[signoff] Running owner QA portal snapshot burst ($BurstCount requests)..."
for ($i = 1; $i -le $BurstCount; $i++) {
  $portalSnapshotRows += Invoke-TimedRequest -Method 'POST' -Url "$BaseUrl/api/v1/inbox/owner-qa/snapshot" -Headers $headers -Body @{
    prompt = "Show upcoming dues in the next 30 days"
    limit = 10
  }
}

if (-not [string]::IsNullOrWhiteSpace($OwnerQaSessionId)) {
  Write-Host "[signoff] Running owner QA session snapshot burst ($BurstCount requests)..."
  for ($i = 1; $i -le $BurstCount; $i++) {
    $sessionSnapshotRows += Invoke-TimedRequest -Method 'POST' -Url "$BaseUrl/api/v1/inbox/owner-qa/sessions/$OwnerQaSessionId/snapshot" -Headers $headers -Body @{
      prompt = "Which tenants are past due right now?"
      limit = 10
    }
  }
}

if (-not [string]::IsNullOrWhiteSpace($ConversationId)) {
  Write-Host "[signoff] Running conversation owner_qa_snapshot action burst ($BurstCount requests)..."
  for ($i = 1; $i -le $BurstCount; $i++) {
    $conversationActionRows += Invoke-TimedRequest -Method 'PATCH' -Url "$BaseUrl/api/v1/inbox/$ConversationId" -Headers $headers -Body @{
      action = 'owner_qa_snapshot'
      prompt = 'Give me an aging summary by bucket'
    }
  }
}

$report = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString('o')
  baseUrl = $BaseUrl
  samples = $Samples
  burstCount = $BurstCount
  endpoints = [PSCustomObject]@{
    dashboard = Summarize -Rows $dashboardRows
    ownerQaQuality = Summarize -Rows $qualityRows
    ownerQaPortalSnapshot = Summarize -Rows $portalSnapshotRows
    ownerQaSessionSnapshot = if ($sessionSnapshotRows.Count -gt 0) { Summarize -Rows $sessionSnapshotRows } else { $null }
    ownerQaConversationAction = if ($conversationActionRows.Count -gt 0) { Summarize -Rows $conversationActionRows } else { $null }
  }
  errors = [PSCustomObject]@{
    dashboard = @($dashboardRows | Where-Object { -not $_.ok } | Select-Object -ExpandProperty error -Unique)
    ownerQaQuality = @($qualityRows | Where-Object { -not $_.ok } | Select-Object -ExpandProperty error -Unique)
    ownerQaPortalSnapshot = @($portalSnapshotRows | Where-Object { -not $_.ok } | Select-Object -ExpandProperty error -Unique)
    ownerQaSessionSnapshot = @($sessionSnapshotRows | Where-Object { -not $_.ok } | Select-Object -ExpandProperty error -Unique)
    ownerQaConversationAction = @($conversationActionRows | Where-Object { -not $_.ok } | Select-Object -ExpandProperty error -Unique)
  }
}

$targetDir = Split-Path -Path $OutputPath -Parent
if ($targetDir -and -not (Test-Path $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding UTF8

Write-Host "[signoff] Saved report -> $OutputPath"
Write-Host "[signoff] Dashboard p95(ms): $($report.endpoints.dashboard.p95Ms)"
Write-Host "[signoff] OwnerQaQuality p95(ms): $($report.endpoints.ownerQaQuality.p95Ms)"
Write-Host "[signoff] OwnerQaPortalSnapshot p95(ms): $($report.endpoints.ownerQaPortalSnapshot.p95Ms)"
