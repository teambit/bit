/** @flow */
import fs from 'fs-extra';
import glob from 'glob';
import R from 'ramda';
import path from 'path';
import semver from 'semver';
import { Consumer, loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_IMPORT_ENVIRONMENT } from '../../../cli/loader/loader-messages';
import { flattenDependencies } from '../../../scope/flatten-dependencies';
import { COMPONENT_ORIGINS } from '../../../constants';
import { BitId } from '../../../bit-id';
import type { ImportOptions } from '../../../consumer/component/import-components';

const key = R.compose(R.head, R.keys);

export type EnvironmentOptions = {
  tester: boolean,
  compiler: boolean,
  extension: boolean
};

export default (async function importAction(
  environmentOptions: EnvironmentOptions,
  importOptions: ImportOptions,
  packageManagerArgs: string[]
) {
  async function importEnvironment(consumer: Consumer): Promise<any> {
    loader.start(BEFORE_IMPORT_ENVIRONMENT);

    // TODO - import environment on multiple environments
    const envDependencies = await consumer.importEnvironment(importOptions.ids[0], importOptions.verbose, true);
    const id = envDependencies[0].component.id.toString();
    function writeToBitJsonIfNeeded() {
      if (environmentOptions.compiler) {
        consumer.bitJson.compilerId = id;
        return consumer.bitJson.write({ bitDir: consumer.getPath() });
      }

      if (environmentOptions.tester) {
        consumer.bitJson.testerId = id;
        return consumer.bitJson.write({ bitDir: consumer.getPath() });
      }

      if (environmentOptions.extension) {
        const idWithoutVersion = BitId.getStringWithoutVersion(id);
        // don't create the same extension twice - check if older version exists and override it
        const oldVersion = Object.keys(consumer.bitJson.extensions).find((ext) => {
          return BitId.getStringWithoutVersion(ext) === idWithoutVersion;
        });
        if (oldVersion) {
          consumer.bitJson.extensions[id] = consumer.bitJson.extensions[oldVersion];
          delete consumer.bitJson.extensions[oldVersion];
          return consumer.bitJson.write({ bitDir: consumer.getPath() });
        }
        consumer.bitJson.extensions[id] = {
          options: {},
          config: {}
        };
        return consumer.bitJson.write({ bitDir: consumer.getPath() });
      }

      return Promise.resolve(true);
    }
    await writeToBitJsonIfNeeded();
    return { envDependencies };
  }

  const consumer: Consumer = await loadConsumer();
  consumer.packageManagerArgs = packageManagerArgs;
  if (environmentOptions.tester || environmentOptions.compiler || environmentOptions.extension) {
    return importEnvironment(consumer);
  }
  const { dependencies, envDependencies } = await consumer.importComponents(importOptions);
  const bitIds = dependencies.map(R.path(['component', 'id']));
  const notAuthored = (bitId) => {
    const componentMap = consumer.bitMap.getComponent(bitId);
    return componentMap && componentMap.origin !== COMPONENT_ORIGINS.AUTHORED;
  };
  const notAuthoredBitIds = R.filter(notAuthored, bitIds);
  if (!R.isEmpty(notAuthoredBitIds)) {
    // not needed when importing from bit.json/bit.map
    await consumer.bitJson.addDependencies(notAuthoredBitIds).write({ bitDir: consumer.getPath() });
  }

  const warnings = await warnForPackageDependencies({
    dependencies: flattenDependencies(dependencies),
    envDependencies,
    consumer,
    installNpmPackages: importOptions.installNpmPackages
  });
  return { dependencies, envDependencies, warnings };
});

// TODO: refactor to better use of semver
// TODO: move to bit-javascript
const getSemverType = (str): ?string => {
  if (semver.valid(str)) return 'V'; // VALID_VERSION
  if (semver.validRange(str)) return 'R'; // RANGE_VERSIONS
  return null;
};

// TODO: refactor to better use of semver
// TODO: move to bit-javascript
function compatibleWith(a: { [string]: string }, b: { [string]: string }): boolean {
  const depName = key(a);
  if (!b[depName]) return false; // dependency does not exist - return false
  const bVersion = b[depName];
  const aVersion = a[depName];
  const aType = getSemverType(aVersion);
  const bType = getSemverType(bVersion);
  if (!aType || !bType) return false; // in case one of the versions is invalid - return false
  if (aType === 'V' && bType === 'V') {
    return semver.eq(aVersion, bVersion);
  }
  if (aType === 'V' && bType === 'R') {
    return semver.satisfies(aVersion, bVersion);
  }
  if (aType === 'R' && bType === 'V') {
    return semver.satisfies(bVersion, aVersion);
  }
  if (aType === 'R' && bType === 'R') {
    if (aVersion.startsWith('^') && bVersion.startsWith('^')) {
      const aMajorVersion = parseInt(aVersion[1], 10);
      const bMajorVersion = parseInt(bVersion[1], 10);
      if (aMajorVersion === bMajorVersion) return true;
    }
  }
  return false;
}

// TODO: refactor to better use of semver
// TODO: move to bit-javascript
const warnForPackageDependencies = ({ dependencies, consumer, installNpmPackages }): Promise<Object> => {
  const warnings = {
    notInPackageJson: [],
    notInNodeModules: [],
    notInBoth: []
  };
  if (installNpmPackages) return Promise.resolve(warnings);
  const projectDir = consumer.getPath();
  const getPackageJson = (dir) => {
    try {
      return fs.readJSONSync(path.join(dir, 'package.json'));
    } catch (e) {
      return {};
    } // do we want to inform the use that he has no package.json
  };
  const packageJson = getPackageJson(projectDir);
  const packageJsonDependencies = R.merge(packageJson.dependencies || {}, packageJson.devDependencies || {});

  const getNameAndVersion = pj => ({ [pj.name]: pj.version });
  const nodeModules = R.mergeAll(
    glob.sync(path.join(projectDir, 'node_modules', '*')).map(R.compose(getNameAndVersion, getPackageJson))
  );

  dependencies.forEach((dep) => {
    //eslint-disable-line
    if (!dep.packageDependencies || R.isEmpty(dep.packageDependencies)) return null;

    R.forEachObjIndexed((packageDepVersion, packageDepName) => {
      const packageDep = { [packageDepName]: packageDepVersion };
      const compatibleWithPackgeJson = compatibleWith(packageDep, packageJsonDependencies);
      const compatibleWithNodeModules = compatibleWith(packageDep, nodeModules);

      if (!compatibleWithPackgeJson && !compatibleWithNodeModules && !R.contains(packageDep, warnings.notInBoth)) {
        warnings.notInBoth.push(packageDep);
      }

      if (
        !compatibleWithPackgeJson &&
        compatibleWithNodeModules &&
        !R.contains(packageDep, warnings.notInPackageJson)
      ) {
        warnings.notInPackageJson.push(packageDep);
      }

      if (
        compatibleWithPackgeJson &&
        !compatibleWithNodeModules &&
        !R.contains(packageDep, warnings.notInNodeModules)
      ) {
        warnings.notInNodeModules.push(packageDep);
      }
    }, dep.packageDependencies);
  });

  // Remove duplicates warnings for missing packages
  warnings.notInBoth = R.uniq(warnings.notInBoth);

  return Promise.resolve(warnings);
};
