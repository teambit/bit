# build-chocolatey.ps1: Builds a Chocolatey package for Bit, and optionally pushes it to
# Chocolatey.org (if the -Publish flag is passed).

param(
  [switch] $Publish = $false
)

#$ErrorActionPreference = 'Stop'; # stop on all errors

$latest_version = $(node -p -e "require('./package.json').version")
#$latest_chocolatey_version = (Find-Package -Name Bit).Version

#if ([Version]$latest_chocolatey_version -ge [Version]$latest_version) {
#  Write-Output ('Current version ({0}) is the latest' -f $latest_chocolatey_version)
#  Exit
#}

#Write-Output ('Latest version is {0}, version on Chocolatey is {1}. Updating...' -f $latest_version, $latest_chocolatey_version)

if (-Not (Test-Path artifacts)) {
  mkdir artifacts
}
# Remove any existing Chocolatey packages, we don't care about them any more
rm artifacts/*.nupkg

# Download the installer so we can compute its hash
# Keep this in sync with chocolateyInstall.ps1.in
# This is intentionally not using /latest.msi to ensure the URL used by the Chocolatey package is valid.
$url = "https://bitsrc.jfrog.io/bitsrc/bit-msi/$env:ENVIRONMENT/bit/$latest_version/bit-$latest_version-unsigned.msi"
$installer_file = [IO.Path]::GetTempFileName()
Invoke-WebRequest -Uri $url -OutFile $installer_file

$hash = (Get-FileHash -Path $installer_file -Algorithm SHA256).Hash

# Replace placeholders in chocolateyInstall.ps1
$content = [System.IO.File]::ReadAllText("$PSScriptRoot\..\resources\win-chocolatey\tools\chocolateyinstall.ps1.in").Replace("{VERSION}",$latest_version).Replace("{CHECKSUM}",$hash).Replace("{ENVIRONMENT}",$env:ENVIRONMENT)
[System.IO.File]::WriteAllText("$PSScriptRoot\..\resources\win-chocolatey\tools\chocolateyinstall.ps1", $content)


choco pack $PSScriptRoot\..\resources\win-chocolatey\bit.nuspec --version $latest_version
mv *.nupkg artifacts

if (!$Publish) {
  Write-Output 'Not publishing the package - Use "-Publish" flag if you want to publish it'
  Exit
}

$filename = ls artifacts\*.nupkg | % FullName
choco push $filename