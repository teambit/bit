/** @flow */
import fs from 'fs-extra';
import glob from 'glob';
import R from 'ramda';
import path from 'path';
import semver from 'semver';
import Bit from '../../../consumer/component';
import { Consumer, loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_IMPORT_ENVIRONMENT } from '../../../cli/loader/loader-messages';
import { flattenDependencies } from '../../../scope/flatten-dependencies';
const key = R.compose(R.head, R.keys);

export default async function importAction(
  { ids, tester, compiler, verbose, prefix, environment }: {
    ids: string,
    tester: ?bool,
    compiler: ?bool,
    verbose: ?bool,
    prefix: ?string,
    environment: ?bool,
  }): Promise<Bit[]> {
  async function importEnvironment(consumer: Consumer) {
    loader.start(BEFORE_IMPORT_ENVIRONMENT);

    // TODO - import environment on multiple environments
    const envDependencies = await consumer.importEnvironment(ids[0], verbose);
    function writeToBitJsonIfNeeded() {
      if (compiler) {
        consumer.bitJson.compilerId = envDependencies[0].id.toString();
        return consumer.bitJson.write({ bitDir: consumer.getPath() });
      }

      if (tester) {
        consumer.bitJson.testerId = envDependencies[0].id.toString();
        return consumer.bitJson.write({ bitDir: consumer.getPath() });
      }

      return Promise.resolve(true);
    }
    await writeToBitJsonIfNeeded();
    return { envDependencies };
  }

  const consumer: Consumer = await loadConsumer();
  if (tester || compiler) { return importEnvironment(consumer); }
  const cache = false;
  const { dependencies, envDependencies } = await consumer.import(ids, verbose, environment, cache, prefix);
  const bitIds = dependencies.map(R.path(['component', 'id']));
  if (!R.isEmpty(ids)) { // not needed when importing from bit.json/bit.map
    await consumer.bitJson.addDependencies(bitIds).write({ bitDir: consumer.getPath() });
  }

  const warnings = await warnForPackageDependencies({
    dependencies: flattenDependencies(dependencies),
    envDependencies,
    consumer,
  });
  return { dependencies, envDependencies, warnings };
}

const getSemverType = (str): ?string => {
  if (semver.valid(str)) return 'V'; // VALID_VERSION
  if (semver.validRange(str)) return 'R'; // RANGE_VERSIONS
  return null;
};

function compatibleWith(a: { [string]: string }, b: { [string]: string, }): bool {
  const depName = key(a);
  if (!b[depName]) return false; // dependency does not exist - return false
  const bVersion = b[depName];
  const aVersion = a[depName];
  const aType = getSemverType(aVersion);
  const bType = getSemverType(bVersion);
  if (!aType || !bType) return false; // in case one of the versions is invalid - return false
  if (aType === 'V' && bType === 'V') { return semver.eq(aVersion, bVersion); }
  if (aType === 'V' && bType === 'R') { return semver.satisfies(aVersion, bVersion); }
  if (aType === 'R' && bType === 'V') { return semver.satisfies(bVersion, aVersion); }
  if (aType === 'R' && bType === 'R') {
    if (aVersion.startsWith('^') && (bVersion.startsWith('^'))) {
      const aMajorVersion = parseInt(aVersion[1], 10);
      const bMajorVersion = parseInt(bVersion[1], 10);
      if (aMajorVersion === bMajorVersion) return true;
    }
  }
  return false;
}

const warnForPackageDependencies = ({ dependencies, consumer }): Promise<Object> => {
  const warnings = {
    notInPackageJson: [],
    notInNodeModules: [],
    notInBoth: [],
  };

  const projectDir = consumer.getPath();
  const getPackageJson = (dir) => {
    try {
      return fs.readJSONSync(path.join(dir, 'package.json'));
    } catch (e) { return {}; } // do we want to inform the use that he has no package.json
  };
  const packageJson = getPackageJson(projectDir);
  const packageJsonDependencies = R.merge(
    packageJson.dependencies || {}, packageJson.devDependencies || {}
  );

  const getNameAndVersion = pj => ({ [pj.name]: pj.version });
  const nodeModules = R.mergeAll(
    glob.sync(path.join(projectDir, 'node_modules', '*'))
    .map(R.compose(getNameAndVersion, getPackageJson))
  );

  dependencies.forEach((dep) => { //eslint-disable-line
    if (!dep.packageDependencies || R.isEmpty(dep.packageDependencies)) return null;

    R.forEachObjIndexed((packageDepVersion, packageDepName) => {
      const packageDep = { [packageDepName]: packageDepVersion };
      const compatibleWithPackgeJson = compatibleWith(packageDep, packageJsonDependencies);
      const compatibleWithNodeModules = compatibleWith(packageDep, nodeModules);

      if (!compatibleWithPackgeJson && !compatibleWithNodeModules && !R.contains(packageDep, warnings.notInBoth)) {
        warnings.notInBoth.push(packageDep);
      }

      if (!compatibleWithPackgeJson && compatibleWithNodeModules && !R.contains(packageDep, warnings.notInPackageJson)) {
        warnings.notInPackageJson.push(packageDep);
      }

      if (compatibleWithPackgeJson && !compatibleWithNodeModules && !R.contains(packageDep, warnings.notInNodeModules)) {
        warnings.notInNodeModules.push(packageDep);
      }
    }, dep.packageDependencies);
  });

  // Remove duplicates warnings for missing packages
  warnings.notInBoth = R.uniq(warnings.notInBoth);

  return Promise.resolve(warnings);
};
