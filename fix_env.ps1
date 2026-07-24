$path = "c:\Users\albin.holmgren\OneDrive - Easyfairs\Desktop\Albin\2Hands\apps\web\.env.local"
$content = Get-Content "c:\Users\albin.holmgren\OneDrive - Easyfairs\Desktop\Albin\2Hands\.env.local" -Raw
$content = $content -replace "`r`n", "`n"
$content = $content -replace "\\r\\n`"", '"'
$content = $content -replace "\\r`"", '"'
$content = $content -replace "\\n`"", '"'
$content = $content -replace '\\r\\n', ''
$content = $content -replace '\\n', ''
$content = $content -replace 'SHARED_VM_IP="184\.105\.5\.101"', 'SHARED_VM_IP="184.105.3.69"'

$examplePath = "c:\Users\albin.holmgren\OneDrive - Easyfairs\Desktop\Albin\2Hands\apps\web\.env.example"
$exampleContent = Get-Content $examplePath -Raw

$merged = $exampleContent + "`n" + $content
[System.IO.File]::WriteAllText($path, $merged)
Write-Host 'Fixed ENV'
