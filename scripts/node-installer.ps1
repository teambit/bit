$url = "https://nodejs.org/dist/v6.10.0/node-v6.10.0-win-x64.zip"
$zipName = "node-v6.10.0-win-x64.zip"


$client = New-Object System.Net.WebClient
$client.DownloadFile($url, $zipName)
mkdir distribution
mkdir distribution/windowsNode
mv node-v6.10.0-win-x64.zip distribution/windowsNode/
cd distribution/windowsNode
tar -xzf node-v6.10.0-win-x64.zip  --strip 1
mv node.exe ../../bin/
cd ../../
rm distribution -Recurse
