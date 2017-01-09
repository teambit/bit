$ErrorActionPreference = 'Stop'
npm install
npm run build
rm -r .\node_modules
npm install --production
#tar --exclude='./Jenkinsfile' --exclude='./distribution/' --exclude='./scripts/' -zcvf  pack.tgz *