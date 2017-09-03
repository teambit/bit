"%ProgramFiles(x86)%\MSBuild\14.0\Bin\MSBuild.exe" ./scripts/windows/BitSetup.wixproj /p:Configuration=Release
$VERSION= $(node -p -e "require('./package.json').version")
mv distribution\windows\distribution\winMsibin\Release\Bit.msi  artifacts\bit-$VERSION-unsigned.msi
