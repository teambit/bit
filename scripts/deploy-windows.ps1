param(
  [switch] $Publish = $false,
  [string] $Repo = "",
  [string] $File = "",
  [string] $Source = "",
  [string] $ENVIRONMENT = "",
  [string] $ReleaseServer = "",
  [string] $Method = ""
 )

$VERSION= $(node -p -e "require('./package.json').version")
$repoUrl = "https://bitsrc.jfrog.io/bitsrc"


$AF_USER = $env:repoUser 
$AF_PWD = ConvertTo-SecureString "$env:repoPassword" -AsPlainText -Force  
$CREDS = New-Object System.Management.Automation.PSCredential ($AF_USER, $AF_PWD)  

$URI = New-Object System.Uri("${repoUrl}/$Repo/$ENVIRONMENT/bit/${VERSION}/$File")  
$SOURCE = "$Source"  
Invoke-WebRequest -Uri $URI -InFile $SOURCE -Method Put -Credential $CREDS


$body = @{
    version="$VERSION"
    method="$Method"
    file="$repoUrl/$Repo/$ENVIRONMENT/bit/${VERSION}/$File"
}
$AF_USER = "$env:releaseUser"  
$AF_PWD = ConvertTo-SecureString "$env:releasePassword" -AsPlainText -Force  
$CREDS = New-Object System.Management.Automation.PSCredential ($AF_USER, $AF_PWD)  

$json = $body | ConvertTo-Json
Invoke-RestMethod "$ReleaseServer" -Method Post -Body $json -ContentType 'application/json' -Credential $CREDS