$VERSION= $(node -p -e "require('./package.json').version")
$repoUrl = "http://104.154.76.155:8081/artifactory"
$AF_USER = $env:repoUser 
$AF_PWD = ConvertTo-SecureString "$env:repoPassword" -AsPlainText -Force  
$CREDS = New-Object System.Management.Automation.PSCredential ($AF_USER, $AF_PWD)  

$URI = New-Object System.Uri("${repoUrl}/bit-msi/development/bit/${VERSION}/bit-${VERSION}-unsigned.msi")  
$SOURCE = "artifacts\bit-${VERSION}-unsigned.msi"  
Invoke-WebRequest -Uri $URI -InFile $SOURCE -Method Put -Credential $CREDS

$URI = New-Object System.Uri("${repoUrl}/bit-nuget/development/bit/${VERSION}/bit.${VERSION}.nupkg")  
$SOURCE = "artifacts\bit.${VERSION}.nupkg"  
Invoke-WebRequest -Uri $URI -InFile $SOURCE -Method Put -Credential $CREDS

$body = @{
    version="$VERSION"
    method='msi'
    file="$repoUrl/bit-msi/bit-${VERSION}-unsigned.msi"
}
$AF_USER = "$env:releaseUser"  
$AF_PWD = ConvertTo-SecureString "$env:releasePassword" -AsPlainText -Force  
$CREDS = New-Object System.Management.Automation.PSCredential ($AF_USER, $AF_PWD)  

$json = $body | ConvertTo-Json
Invoke-RestMethod 'https://api-stg.bitsrc.io/release/update' -Method Post -Body $json -ContentType 'application/json' -Credential $CREDS