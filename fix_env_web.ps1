$path = "c:\Users\albin.holmgren\OneDrive - Easyfairs\Desktop\Albin\2Hands\apps\web\.env.local"
$content = Get-Content $path -Raw
$content = $content -replace "`r`n", "`n"
$content = $content -replace "\\r\\n`"", '"'
$content = $content -replace "\\r`"", '"'
$content = $content -replace "\\n`"", '"'
$content = $content -replace '\\r\\n', ''
$content = $content -replace '\\n', ''
$content = $content -replace 'SHARED_VM_IP="184\.105\.5\.101"', 'SHARED_VM_IP="184.105.3.69"'
[System.IO.File]::WriteAllText($path, $content)
Write-Host 'Fixed ENV web'
