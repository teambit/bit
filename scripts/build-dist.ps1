npm pack
if (Test-Path distribution/windows) {
  rm distribution/windows -Recurse
}
mkdir distribution/windows
mv bit-*.tgz distribution/windows/pack.tgz

cd distribution/windows
tar -xzf pack.tgz --strip 1
rm pack.tgz
npm install --no-optional
npm run build
rm -r node_modules
npm install --production --no-optional
mv scripts/windows/bit.cmd bin/


