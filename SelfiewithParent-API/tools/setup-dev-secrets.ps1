# Sets up LOCAL DEVELOPMENT secrets for the Selfie with Parent API on this machine.
#  - creates / updates the SQL login swp_api_dev (website role swp_app only) on (localdb)\MSSQLLocalDB
#  - stores the connection string, JWT signing key and OTP hash key in .NET user-secrets
# Nothing secret is printed. Safe to run again: it rotates the password and keys.
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\setup-dev-secrets.ps1

$ErrorActionPreference = 'Stop'
$project = Resolve-Path (Join-Path $PSScriptRoot '..\src\SelfiewithParent.Api')
$server  = '(localdb)\MSSQLLocalDB'
$rng     = [System.Security.Cryptography.RandomNumberGenerator]::Create()

function New-Base64Key([int]$bytes) {
    $b = New-Object byte[] $bytes
    $rng.GetBytes($b)
    [Convert]::ToBase64String($b)
}

function New-Password([int]$length) {
    # Unbiased random choice from characters that need no escaping in SQL or a connection string
    $chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_!#%'.ToCharArray()
    $limit = 256 - (256 % $chars.Length)
    $one = New-Object byte[] 1
    do {
        $sb = New-Object System.Text.StringBuilder
        while ($sb.Length -lt $length) {
            $rng.GetBytes($one)
            if ($one[0] -lt $limit) { [void]$sb.Append($chars[$one[0] % $chars.Length]) }
        }
        $p = $sb.ToString()
    } until ($p -cmatch '[a-z]' -and $p -cmatch '[A-Z]' -and $p -match '\d' -and $p -match '[-_!#%]')
    $p
}

Write-Host 'Checking the database...'
$exists = & sqlcmd -S $server -I -b -h -1 -Q "SET NOCOUNT ON; SELECT ISNULL(CONVERT(varchar(10), DB_ID('SelfiewithParentDB')), 'missing')"
if ($LASTEXITCODE -ne 0) { throw 'Could not connect to (localdb)\MSSQLLocalDB.' }
if (($exists | Out-String).Trim() -eq 'missing') { throw 'Database SelfiewithParentDB does not exist on (localdb)\MSSQLLocalDB. Publish the database project first.' }

$password = New-Password 32
$sql = @"
SET NOCOUNT ON;
IF SUSER_ID(N'swp_api_dev') IS NULL
    CREATE LOGIN [swp_api_dev] WITH PASSWORD = N'$password', CHECK_POLICY = ON, DEFAULT_DATABASE = [SelfiewithParentDB];
ELSE
    ALTER LOGIN [swp_api_dev] WITH PASSWORD = N'$password';
USE [SelfiewithParentDB];
IF USER_ID(N'swp_api_dev') IS NULL CREATE USER [swp_api_dev] FOR LOGIN [swp_api_dev];
ALTER ROLE [swp_app] ADD MEMBER [swp_api_dev];
"@
& sqlcmd -S $server -I -b -Q $sql | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not create the swp_api_dev login.' }
Write-Host 'Database login swp_api_dev ready (role: swp_app).'

$connection = "Server=$server;Database=SelfiewithParentDB;User ID=swp_api_dev;Password=$password;Encrypt=True;TrustServerCertificate=True;Application Name=SelfiewithParent.Api"
$secrets = [ordered]@{
    'ConnectionStrings:SelfiewithParentDB' = $connection
    'Jwt:SigningKey'                       = New-Base64Key 64
    'Otp:HashKey'                          = New-Base64Key 64
}
foreach ($key in $secrets.Keys) {
    & dotnet user-secrets set $key $secrets[$key] --project $project | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not store user-secret $key." }
    Write-Host "Stored user-secret: $key"
}

$file = Join-Path $env:APPDATA 'Microsoft\UserSecrets\d7fbd19d-b785-4267-9ca0-56d9d9843aa8\secrets.json'
Write-Host "Secrets file: $file (exists: $(Test-Path $file))"
Write-Host 'Done. Start the API from Visual Studio (http or https profile) or with: dotnet run --launch-profile http'
