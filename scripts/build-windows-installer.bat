mv .\package.json .\package.json.bak
Get-Content .\package.json.bak | Where-Object {$_ -nomatch 'posix'} | Set-Content package.json
"%ProgramFiles(x86)%\MSBuild\14.0\Bin\MSBuild.exe" ./scripts/windows/BitSetup.wixproj /p:Configuration=Release