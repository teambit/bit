$ErrorActionPreference = 'Stop'



cd dist
tar -xzf pack.tgz --strip 1
rm pack.tgz
# Change this to "yarn install --production" once #1115 is fixed
npm install --production
../scripts/clean-node-modules.ps1
cd ..