const pnpApi = require('pnpapi');
const fs = require('fs');
const execa = require('execa');
const path = require('path');

const packageLocator = pnpApi.findPackageLocator('.');
const packageInformation = pnpApi.getPackageInformation(packageLocator);

// this was copy-pasted from yarn - it should be tidied up before using in our codebase
const binFolders = new Set();
const binEntries = new Map();
for (const [name, reference] of packageInformation.packageDependencies.entries()) {
  const dependencyInformation = pnpApi.getPackageInformation({ name, reference });

  if (dependencyInformation.packageLocation) {
    binFolders.add(`${dependencyInformation.packageLocation}/.bin`);
  }
}
for (const binFolder of binFolders) {
  if (fs.existsSync(binFolder)) {
    for (const name of fs.readdirSync(binFolder)) {
      binEntries.set(name, path.join(binFolder, name));
    }
  }
}

const jestEntry = binEntries.get('jest');
if (jestEntry) {
  const argString = process.argv.slice(2).join(' ');
  const { stdout } = execa.shellSync(`node -r ./.pnp.js ${jestEntry} ${argString}`);
  console.log(stdout);
}
