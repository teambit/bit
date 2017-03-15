$url = "https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip"
$zipName = "node-v6.10.0-win-x64.zip"

Invoke-WebRequest -Uri $url -OutFile "$PSScriptRoot\..\node-v6.10.0-win-x64.zip"

mkdir distribution
mkdir distribution/windowsNode
mv node-v6.10.0-win-x64.zip distribution/windowsNode/
cd distribution/windowsNode
tar -xzf node-v6.10.0-win-x64.zip  --strip 1
mv node.exe ../../bin/
cd ../../
rm distribution -Recurse
