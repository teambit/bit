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
import { BitId } from '../../../bit-id';
import type { ImportOptions } from '../../../consumer/component-ops/import-components';
import { Analytics } from '../../../analytics/analytics';
import GeneralError from '../../../error/general-error';
import ImportComponents from '../../../consumer/component-ops/import-components';

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
    if (!importOptions.ids.length) throw new GeneralError('you must specify component id for importing an environment');
    const idToImport = importOptions.ids[0];
    const bitIdToImport = BitId.parse(idToImport, true); // import without id is not supported
    const envComponents = await consumer.importEnvironment(bitIdToImport, importOptions.verbose, true);
    if (!envComponents.length) throw new GeneralError(`the environment component ${idToImport} is installed already`);
    const id = envComponents[0].component.id.toString();
    function writeConfigIfNeeded() {
      if (environmentOptions.compiler) {
        consumer.config.compiler = id;
        Analytics.setExtraData('build_env', id);
        return consumer.config.write({ workspaceDir: consumer.getPath() });
      }

      if (environmentOptions.tester) {
        consumer.config.tester = id;
        Analytics.setExtraData('test_env', id);
        return consumer.config.write({ workspaceDir: consumer.getPath() });
      }

      if (environmentOptions.extension) {
        const idWithoutVersion = BitId.getStringWithoutVersion(id);
        // don't create the same extension twice - check if older version exists and override it
        const oldVersion = Object.keys(consumer.config.extensions).find((ext) => {
          return BitId.getStringWithoutVersion(ext) === idWithoutVersion;
        });
        if (oldVersion) {
          consumer.config.extensions[id] = consumer.config.extensions[oldVersion];
          delete consumer.config.extensions[oldVersion];
          return consumer.config.write({ workspaceDir: consumer.getPath() });
        }
        consumer.config.extensions[id] = {
          options: {},
          config: {}
        };
        return consumer.config.write({ workspaceDir: consumer.getPath() });
      }

      return Promise.resolve(true);
    }
    await writeConfigIfNeeded();
    return { envComponents };
  }

  const consumer: Consumer = await loadConsumer();
  consumer.packageManagerArgs = packageManagerArgs;
  if (environmentOptions.tester || environmentOptions.compiler || environmentOptions.extension) {
    return importEnvironment(consumer);
  }
  const importComponents = new ImportComponents(consumer, importOptions);
  const { dependencies, envComponents, importDetails } = await importComponents.importComponents();
  const bitIds = dependencies.map(R.path(['component', 'id']));

  const warnings = await warnForPackageDependencies({
    dependencies: flattenDependencies(dependencies),
    envComponents,
    consumer,
    installNpmPackages: importOptions.installNpmPackages
  });
  Analytics.setExtraData('num_components', bitIds.length);
  await consumer.onDestroy();
  return { dependencies, envComponents, importDetails, warnings };
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

  // eslint-disable-next-line
  dependencies.forEach(dep => {
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
