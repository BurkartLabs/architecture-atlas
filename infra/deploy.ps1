<#
.SYNOPSIS
  Deploys Architecture Atlas to Azure Container Apps (architecture-atlas, in orch-env).

.DESCRIPTION
  Run from the architecture-atlas folder with Docker Desktop running.
    1. Rebuilds the site (tools/build.mjs) and refuses if the working tree has changes the image would carry.
    2. Builds the nginx image and pushes it to the shared registry, tagged with the commit.
    3. Deploys atlas.bicep.
    4. Checks the home page and one plate answer.
  -WhatIf shows what step 3 would change and stops. -Warm keeps one replica running (no cold start).
  Rollback: the script prints the previous image; az containerapp update -n architecture-atlas -g rg-orchestrata --image <it>
#>
param(
  [switch]$WhatIf,
  [switch]$Warm,
  [string]$ResourceGroup = 'rg-orchestrata',
  [string]$AppName = 'architecture-atlas'
)
$ErrorActionPreference = 'Stop'
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed" } }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

Write-Host '== 1. site' -ForegroundColor Yellow
node (Join-Path $repo 'tools/build.mjs') | Select-Object -Last 1; Check 'build'
$dirty = git -C $repo status --porcelain -- index.html assets atlas | Where-Object { $_ -notmatch 'kiln\.html$' }
if ($dirty) { throw "uncommitted changes in the site; commit them first:`n$($dirty -join "`n")" }

Write-Host '== 2. image' -ForegroundColor Yellow
$acr = az acr list -g $ResourceGroup --query "[0].name" -o tsv; Check 'acr list'
$login = az acr show -n $acr --query loginServer -o tsv; Check 'acr show'
$tag = (git -C $repo rev-parse --short HEAD).Trim()
$image = "$login/architecture-atlas:$tag"
$previous = az containerapp list -g $ResourceGroup --query "[?name=='$AppName'].properties.template.containers[0].image | [0]" -o tsv
if (-not $WhatIf) {
  $ErrorActionPreference = 'Continue'; docker info *> $null; $dockerUp = ($LASTEXITCODE -eq 0); $ErrorActionPreference = 'Stop'
  # This subscription does not permit ACR Tasks (TasksOperationsNotAllowed, 2026-10-04), so there is no cloud build.
  if (-not $dockerUp) { throw 'Docker is not running. Start Docker Desktop, wait for "Engine running", then run this script again.' }
  az acr login -n $acr | Out-Null; Check 'acr login'
  docker build -t $image $repo; Check 'docker build'
  docker push $image; Check 'docker push'
}
Write-Host "  $image$(if ($previous) { " (was $previous)" })"

Write-Host '== 3. Container App' -ForegroundColor Yellow
$bicep = Join-Path $here 'atlas.bicep'
$params = @("image=$image", "appName=$AppName", "minReplicas=$(if ($Warm) { 1 } else { 0 })")
if ($WhatIf) {
  az deployment group what-if -g $ResourceGroup -f $bicep -p @params; Check 'what-if'
  Write-Host "`nNothing was changed (-WhatIf)." -ForegroundColor Cyan
  return
}
$out = az deployment group create -g $ResourceGroup -f $bicep -p @params --query properties.outputs -o json | ConvertFrom-Json; Check 'deployment'
$site = $out.siteUrl.value
Write-Host "  $site (revision $($out.latestRevision.value))"

Write-Host '== 4. answers' -ForegroundColor Yellow
foreach ($path in @('/', '/atlas/health-records/', '/assets/manifest.js')) {
  $ok = $false
  for ($i = 0; $i -lt 24 -and -not $ok; $i++) {
    try { $r = Invoke-WebRequest "$site$path" -UseBasicParsing -TimeoutSec 15; $ok = ($r.StatusCode -eq 200) } catch { Start-Sleep 5 }
  }
  if (-not $ok) { throw "no answer from $site$path. Logs: az containerapp logs show -n $AppName -g $ResourceGroup --tail 50" }
  Write-Host "  $site$path 200"
}
Write-Host "  $site" -ForegroundColor Green
if ($previous) { Write-Host "  Rollback: az containerapp update -n $AppName -g $ResourceGroup --image $previous" }
