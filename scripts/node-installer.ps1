$url = "https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip"
$zipName = "$PSScriptRoot/../node-v6.10.0-win-x64.zip"

appveyor DownloadFile https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip  -FileName $PSScriptRoot/"../node-v6.10.0-win-x64.zip"
Get-ChildItem -Force .
mkdir distribution
mkdir distribution/windowsNode
mv $PSScriptRoot/"../node-v6.10.0-win-x64.zip" $PSScriptRoot/"../distribution/windowsNode/"
cd $PSScriptRoot"/../distribution/windowsNode"
Get-ChildItem -Force .
unzip node-v6.10.0-win-x64.zip
Get-ChildItem -Force .
mv node.exe ../../bin/
cd ../../
