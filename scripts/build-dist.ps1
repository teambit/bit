npm pack
if (Test-Path distribution/windows) {
  rm distribution/windows -Recurse
}
$VERSION= $(node -p -e "require('./package.json').version")
mkdir distribution
mkdir distribution/windows
mv bit-bin-$VERSION.tgz distribution/windows/

cd distribution/windows

tar -xzf bit-bin-$VERSION.tgz --strip 1
rm bit-bin-$VERSION.tgz
npm install --no-optional
bit import
npm run build
rm -r node_modules
npm install --production --no-optional
mv scripts/windows/bit.cmd bin/
