$url = "https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip"
$zipName = "node-v6.10.0-win-x64.zip"

if (Test-Path distribution/windowsNode) {
  rm distribution/windowsNode -Recurse
}
Invoke-WebRequest -Uri $url -OutFile $zipName

Get-ChildItem -Force .
mkdir distribution
mkdir distribution/windowsNode
mv $PSScriptRoot/"../node-v6.10.0-win-x64.zip" $PSScriptRoot/"../distribution/windowsNode/"
cd $PSScriptRoot"/../distribution/windowsNode"
Get-ChildItem -Force .
unzip node-v6.10.0-win-x64.zip
Get-ChildItem -Force .
mv node-v6.10.0-win-x64/node.exe ../../bin/
cd ../../
rm -r distribution
