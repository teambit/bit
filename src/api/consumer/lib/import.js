/** @flow */
import fs from 'fs-extra';
import glob from 'glob';
import R from 'ramda';
import path from 'path';
import semver from 'semver';
import Bit from '../../../consumer/component';
import Consumer from '../../../consumer/consumer';
import loader from '../../../cli/loader';
import { BEFORE_IMPORT_ENVIRONMENT } from '../../../cli/loader/loader-messages';
import { flattenDependencies } from '../../../scope/flatten-dependencies';

const key = R.compose(R.head, R.keys);

export default function importAction(
  { ids, tester, compiler, verbose, prefix, environment }: {
    ids: string,
    tester: ?bool,
    compiler: ?bool,
    verbose: ?bool,
    prefix: ?string,
    environment: ?bool,
  }): Promise<Bit[]> {
  function importEnvironment(consumer) {
    loader.start(BEFORE_IMPORT_ENVIRONMENT);

    // TODO - import environment on multiple environments
    return consumer.importEnvironment(ids[0], verbose)
    .then((envDependencies) => {
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

      return writeToBitJsonIfNeeded()
      .then(() => ({ envDependencies }));
    });
  }

  const performOnDir = prefix ? path.resolve(prefix) : process.cwd();

  return Consumer.ensure(performOnDir)
    .then(consumer => consumer.scope.ensureDir().then(() => consumer))
    .then((consumer) => {
      if (tester || compiler) { return importEnvironment(consumer); }
      const cache = false;
      return consumer.import(ids, verbose, environment, cache)          // from here replace with bit-scope-client.fetch
        .then(({ dependencies, envDependencies }) => {                  //
          const bitIds = dependencies.map(R.path(['component', 'id'])); //
          return consumer.bitJson.addDependencies(bitIds)               //
          .write({ bitDir: consumer.getPath() })                        //
          .then(() => ({ dependencies, envDependencies }));             // here we should return { dependencies, envDependencies: [] }
        })
        .then(({ dependencies, envDependencies }) =>
          warnForPackageDependencies({
            dependencies: flattenDependencies(dependencies),
            envDependencies,
            consumer,
          })
          .then(warnings => consumer.driver.runHook('onImport',
            { components: dependencies, projectRoot: performOnDir },
            { dependencies, envDependencies, warnings })
        ));
    });
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

const warnForPackageDependencies = ({ dependencies, consumer }) => {
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

      if (!compatibleWithPackgeJson && !compatibleWithNodeModules) {
        warnings.notInBoth.push(packageDep);
      }

      if (!compatibleWithPackgeJson && compatibleWithNodeModules) {
        warnings.notInPackageJson.push(packageDep);
      }

      if (compatibleWithPackgeJson && !compatibleWithNodeModules) {
        warnings.notInNodeModules.push(packageDep);
      }
    }, dep.packageDependencies);
  });

  return Promise.resolve(warnings);
};
