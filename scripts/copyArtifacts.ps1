mkdir artifacts
$VERSION= $(node -p -e "require('./package.json').version")
mv distribution\winMsibin\Release\Bit.msi  artifacts\bit-${VERSION}-unsigned.msi
