$url = "https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip"
$zipName = "$PSScriptRoot/../node-v6.10.0-win-x64.zip"

appveyor DownloadFile https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip  -FileName node-v6.10.0-win-x64.zip

mkdir distribution
mkdir distribution/windowsNode
mv $PSScriptRoot/"../node-v6.10.0-win-x64.zip" $PSScriptRoot/"../distribution/windowsNode/"
cd distribution/windowsNode
tar -xzf node-v6.10.0-win-x64.zip  --strip 1
mv node.exe ../../bin/
cd ../../
