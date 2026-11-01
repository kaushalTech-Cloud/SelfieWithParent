# Stores the mailbox address and its password used to email sign-in codes, in .NET user-secrets on this machine.
# The mail server is set in appsettings.json (Email:Smtp:Host — Zoho Mail India: smtp.zoho.in, port 587).
# Nothing is written to the project and nothing secret is printed.
#
# Zoho: if two-factor sign-in is on, create an app-specific password at
#   https://accounts.zoho.in  →  Security  →  App Passwords   (use that, not your normal Zoho password)
#
# Run:     powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\set-email-secrets.ps1
# Remove:  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\set-email-secrets.ps1 -Remove

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$project = Resolve-Path (Join-Path $PSScriptRoot '..\src\SelfiewithParent.Api')

if ($Remove) {
    foreach ($key in 'Email:Smtp:Username', 'Email:Smtp:Password') {
        & dotnet user-secrets remove $key --project $project | Out-Null
    }
    Write-Host 'Email secrets removed. Sign-in codes will be written to the API console again (development).'
    return
}

$address = (Read-Host 'Mailbox address (e.g. selfiewithparent@zohomail.in)').Trim()
if ($address -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'That does not look like an email address.' }

$secure = Read-Host 'Zoho app-specific password (input is hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $password = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $password) { throw 'No password entered.' }

# Sent through standard input (not the command line), so the password never appears in the process list
$json = @{ 'Email:Smtp:Username' = $address; 'Email:Smtp:Password' = $password } | ConvertTo-Json -Compress
$json | & dotnet user-secrets set --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not store the user-secrets.' }
$password = $null; $json = $null

Write-Host "Stored user-secrets: Email:Smtp:Username ($address) and Email:Smtp:Password."
Write-Host 'Restart the API. Its console should say: "Email sign-in codes: sent by SMTP (smtp.zoho.in)".'
