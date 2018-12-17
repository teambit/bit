// @flow

const fs = require('fs-extra');
const semver = require('semver'); // TODO: do not depend on semver

const pnpApi = fs.readFileSync(`${__dirname}/generate-pnp-map-api.tpl.js`);

const crypto = require('crypto');
const path = require('path');

const getHashFrom = (data) => {
  const hashGenerator = crypto.createHash('sha1');

  for (const datum of data) {
    hashGenerator.update(datum);
  }

  return hashGenerator.digest('hex');
};

function generateMaps(packageInformationStores, blacklistedLocations) {
  let code = '';

  // Bake the information stores into our generated code
  code += 'let packageInformationStores = new Map([\n';
  for (const [packageName, packageInformationStore] of packageInformationStores) {
    code += `  [${JSON.stringify(packageName)}, new Map([\n`;
    for (const [packageReference, { packageLocation, packageDependencies }] of packageInformationStore) {
      code += `    [${JSON.stringify(packageReference)}, {\n`;
      code += `      packageLocation: path.resolve(__dirname, ${JSON.stringify(packageLocation)}),\n`;
      code += '      packageDependencies: new Map([\n';
      for (const [dependencyName, dependencyReference] of packageDependencies.entries()) {
        code += `        [${JSON.stringify(dependencyName)}, ${JSON.stringify(dependencyReference)}],\n`;
      }
      code += '      ]),\n';
      code += '    }],\n';
    }
    code += '  ])],\n';
  }
  code += ']);\n';

  code += '\n';

  // Also bake an inverse map that will allow us to find the package information based on the path
  code += 'let locatorsByLocations = new Map([\n';
  for (const blacklistedLocation of blacklistedLocations) {
    code += `  [${JSON.stringify(blacklistedLocation)}, blacklistedLocator],\n`;
  }
  for (const [packageName, packageInformationStore] of packageInformationStores) {
    for (const [packageReference, { packageLocation }] of packageInformationStore) {
      if (packageName !== null) {
        code += `  [${JSON.stringify(packageLocation)}, ${JSON.stringify({
          name: packageName,
          reference: packageReference
        })}],\n`;
      } else {
        code += `  [${JSON.stringify(packageLocation)}, topLevelLocator],\n`;
      }
    }
  }
  code += ']);\n';

  return code;
}

function generateFindPackageLocator(packageInformationStores) {
  let code = '';

  // We get the list of each string length we'll need to check in order to find the current package context
  const lengths = new Map();

  for (const packageInformationStore of packageInformationStores.values()) {
    for (const { packageLocation } of packageInformationStore.values()) {
      if (packageLocation === null) {
        continue;
      }

      const length = packageLocation.length;
      const count = (lengths.get(length) || 0) + 1;

      lengths.set(length, count);
    }
  }

  // We must try the larger lengths before the smaller ones, because smaller ones might also match the longest ones
  // (for instance, /project/path will match /project/path/.pnp/global/node_modules/pnp-cf5f9c17b8f8db)
  const sortedLengths = Array.from(lengths.entries()).sort((a, b) => {
    return b[0] - a[0];
  });

  // Generate a function that, given a file path, returns the associated package name
  code += 'exports.findPackageLocator = function findPackageLocator(location) {\n';
  code += '  let relativeLocation = normalizePath(path.relative(__dirname, location));\n';
  code += '\n';
  code += '  if (!relativeLocation.match(isStrictRegExp))\n';
  code += '    relativeLocation = `./${relativeLocation}`;\n';
  code += '\n';
  code += "  if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')\n";
  code += '    relativeLocation = `${relativeLocation}/`;\n';
  code += '\n';
  code += '  let match;\n';

  for (const [length] of sortedLengths) {
    code += '\n';
    code += `  if (relativeLocation.length >= ${length} && relativeLocation[${length - 1}] === '/')\n`;
    code += `    if (match = locatorsByLocations.get(relativeLocation.substr(0, ${length})))\n`;
    code += '      return blacklistCheck(match);\n';
  }

  code += '\n';
  code += '  return null;\n';
  code += '};\n';

  return code;
}

function getPackageFolder(cacheFolder, folder) {
  // TODO: use already written methods for this
  const firstFolder = fs.readdirSync(path.join(cacheFolder, folder, 'node_modules'))[0];
  if (!firstFolder) return null;
  if (/^\@/.test(firstFolder)) {
    // scoped package
    const secondFolder = fs.readdirSync(path.join(cacheFolder, folder, 'node_modules', firstFolder))[0];
    if (!secondFolder) return null;
    return {
      packageFolder: path.join(cacheFolder, folder, 'node_modules', firstFolder, secondFolder),
      cacheLocation: path.join(cacheFolder, folder)
    };
  }
  return {
    packageFolder: path.join(cacheFolder, folder, 'node_modules', firstFolder),
    cacheLocation: path.join(cacheFolder, folder)
  };
}

function findPeerDepVersion(name, versionPattern, packageInformationStores) {
  // TODO: more deterministic
  const packages = packageInformationStores.get(name);
  if (!packages) return null;
  const candidates = Array.from(packages.keys())
    .filter(version => semver.satisfies(version, versionPattern))
    .sort();
  return candidates[candidates.length - 1];
}

async function getPackageInformationStores(logicalDependencyTree, cacheFolder, targetFolder) {
  const cacheContents = fs.readdirSync(cacheFolder);
  const cacheFolders = cacheContents.reduce((dict, folder) => {
    // TODO: build cache better - this is just so we're compatible with yarn's method
    if (!folder.startsWith('npm')) return dict;
    const packageCacheEntry = getPackageFolder(cacheFolder, folder);
    if (!packageCacheEntry) return dict;
    const { packageFolder, cacheLocation } = packageCacheEntry;

    const packageJson = JSON.parse(fs.readFileSync(path.join(packageFolder, 'package.json')));
    const packageName = packageJson.name;
    const packageVersion = packageJson.version;
    dict[`${packageName}-${packageVersion}`] = { packageFolder, cacheLocation, packageName, packageVersion };
    return dict;
  }, {});
  const symlinks = new Map();
  const packageInformationStores = new Map();
  const blacklistedLocations = new Set(); // TBD
  logicalDependencyTree.forEach((node, cb) => {
    const packageName = node.isRoot ? null : node.name;
    const packageVersion = node.isRoot ? null : node.version;
    const cacheEntry = cacheFolders[`${packageName}-${packageVersion}`];
    const packageAbsPath = cacheEntry ? cacheEntry.packageFolder : '.';
    const packageLocation = node.isRoot ? './' : `${path.relative(targetFolder, packageAbsPath)}/`; // TODO: fix this
    const packageDependencies =
      node.dependencies && node.dependencies.size > 0
        ? Array.from(node.dependencies.keys()).reduce((packageVersions, packageName) => {
          const { version } = node.dependencies.get(packageName);
          packageVersions.set(packageName, version);
          return packageVersions;
        }, new Map())
        : new Map([[node.name, node.version]]);
    packageDependencies.set(node.name, node.version);
    let packageInformationStore = packageInformationStores.get(packageName);
    if (!packageInformationStore) {
      packageInformationStore = new Map();
      packageInformationStores.set(packageName, packageInformationStore);
    }
    packageInformationStore.set(packageVersion, {
      packageLocation,
      packageDependencies
    });
    cb();
  });
  logicalDependencyTree.forEach((node, cb) => {
    // second pass for peer dependencies
    const packageName = node.name;
    const packageVersion = node.version;
    const { packageFolder, cacheLocation } = cacheFolders[`${packageName}-${packageVersion}`] || {
      packageFolder: '.',
      cacheLocation: '.'
    };
    const packageLocation = path.relative(targetFolder, packageFolder) || '.';
    const packageManifest = JSON.parse(fs.readFileSync(path.join(packageFolder, 'package.json')));
    const peerDependencies = packageManifest.peerDependencies;
    if (peerDependencies) {
      // TODO: treat as normal dependency if there is only one parent
      const parentNamesAndVersions = Array.from(node.requiredBy).map(({ name, version, isRoot }) => ({
        name,
        version,
        isRoot
      }));
      if (parentNamesAndVersions.length === 1) {
        // no need to instatiate separately if there is only one instance
        const packageInformationStore = packageInformationStores.get(packageName).get(packageVersion); // parent of peer dep
        Object.keys(peerDependencies).forEach((name) => {
          const versionPattern = peerDependencies[name];
          const version = findPeerDepVersion(name, versionPattern, packageInformationStores);
          if (version) {
            packageInformationStore.packageDependencies.set(name, version);
          } else {
            // TBD - peer dep not installed... some sort of warning?
          }
        });
      } else {
        parentNamesAndVersions.forEach(({ name, version, isRoot }) => {
          const hash = isRoot
            ? getHashFrom([packageName, packageVersion])
            : getHashFrom([name, version, packageName, packageVersion]);
          const hashName = `pnp-${hash}`;
          const symlinkLoc = path.resolve(targetFolder, '.pnp', 'externals', hashName);
          const packageLocation = `./${path.relative(
            // TODO: fix this
            targetFolder,
            path.resolve(targetFolder, '.pnp', 'externals', hashName, 'node_modules', packageName)
          )}/`; // TODO: fix this too
          const packageReference = `pnp:${hash}`;
          symlinks.set(symlinkLoc, cacheLocation);

          let packageInformationStore = packageInformationStores.get(packageName);
          if (!packageInformationStore) {
            // TODO: can this actually happen?
            packageInformationStore = new Map();
            packageInformationStores.set(packageName, packageInformationStore);
          }

          const packageDependencies =
            node.dependencies && node.dependencies.size > 0
              ? Array.from(node.dependencies.keys())
                .concat(Object.keys(peerDependencies))
                .reduce((packageVersions, packageName) => {
                  const { version } = node.dependencies.get(packageName) || {
                    version: findPeerDepVersion(packageName, peerDependencies[packageName], packageInformationStores)
                  };
                  packageVersions.set(packageName, version);
                  return packageVersions;
                }, new Map())
              : new Map([[node.name, node.version]]);
          packageDependencies.set(node.name, packageReference);

          packageInformationStore.set(packageReference, {
            packageLocation,
            packageDependencies
          });

          let parentPackageInformationStore = packageInformationStores.get(isRoot ? null : name);
          if (!parentPackageInformationStore) {
            // TODO: can this actually happen?
            parentPackageInformationStore = new Map();
            packageInformationStores.set(name, parentPackageInformationStore);
          }
          const parentDepInfo = parentPackageInformationStore.get(isRoot ? null : version);
          parentDepInfo.packageDependencies.set(packageName, packageReference);
        });
      }
    }
    cb();
  });

  return [packageInformationStores, blacklistedLocations, symlinks];
}

module.exports = async function generatePnpMap(logicalDependencyTree, cacheFolder, targetFolder) {
  const [packageInformationStores, blacklistedLocations, symlinks] = await getPackageInformationStores(
    logicalDependencyTree,
    cacheFolder,
    targetFolder
  );

  const setupStaticTables = [
    generateMaps(packageInformationStores, blacklistedLocations),
    generateFindPackageLocator(packageInformationStores)
  ].join('');

  return {
    pnpjs: pnpApi
      .toString()
      // .replace(/\$\$SHEBANG/g, config.plugnplayShebang) // TBD
      .replace(/\$\$BLACKLIST/g, 'null') // TBD
      .replace(/\$\$SETUP_STATIC_TABLES\(\);/g, setupStaticTables),
    symlinks
  };
};
