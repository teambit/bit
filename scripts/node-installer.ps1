$url = "https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip"
$zipName = "$PSScriptRoot/../node-v6.10.0-win-x64.zip"

Invoke-WebRequest $url -OutFile $zipName

mkdir distribution
mkdir distribution/windowsNode
mv node-v6.10.0-win-x64.zip distribution/windowsNode/
cd distribution/windowsNode
tar -xzf node-v6.10.0-win-x64.zip  --strip 1
mv node.exe ../../bin/
cd ../../
rm distribution -Recurse
