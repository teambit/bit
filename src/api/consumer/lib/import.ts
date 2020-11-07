import fs from 'fs-extra';
import glob from 'glob';
import * as path from 'path';
import R from 'ramda';
import semver from 'semver';

import { Analytics } from '../../../analytics/analytics';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_IMPORT_ENVIRONMENT } from '../../../cli/loader/loader-messages';
import { Consumer, loadConsumer } from '../../../consumer';
import ImportComponents, { ImportOptions } from '../../../consumer/component-ops/import-components';
import { LanesIsDisabled } from '../../../consumer/lanes/exceptions/lanes-is-disabled';
import GeneralError from '../../../error/general-error';
import { flattenDependencies } from '../../../scope/flatten-dependencies';
import FlagHarmonyOnly from './exceptions/flag-harmony-only';

const key = R.compose(R.head, R.keys);

export type EnvironmentOptions = {
  tester: boolean;
  compiler: boolean;
};

export default async function importAction(
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
    async function writeConfigIfNeeded() {
      if (environmentOptions.compiler) {
        consumer.config._setCompiler(id);
        Analytics.setExtraData('build_env', id);
        const res = consumer.config.write({ workspaceDir: consumer.getPath() });
        return res;
      }

      if (environmentOptions.tester) {
        consumer.config._setTester(id);
        Analytics.setExtraData('test_env', id);
        return consumer.config.write({ workspaceDir: consumer.getPath() });
      }

      return Promise.resolve(true);
    }
    await writeConfigIfNeeded();
    return { envComponents };
  }

  const consumer: Consumer = await loadConsumer();
  if (importOptions.skipLane && consumer.isLegacy) throw new LanesIsDisabled();
  consumer.packageManagerArgs = packageManagerArgs;
  if (environmentOptions.tester || environmentOptions.compiler) {
    return importEnvironment(consumer);
  }
  if (importOptions.writeConfig && consumer.config.isLegacy) {
    throw new FlagHarmonyOnly('--conf');
  }
  const importComponents = new ImportComponents(consumer, importOptions);
  const { dependencies, envComponents, importDetails } = await importComponents.importComponents();
  const bitIds = dependencies.map(R.path(['component', 'id']));

  const warnings = await warnForPackageDependencies({
    dependencies: flattenDependencies(dependencies),
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    envComponents,
    consumer,
    installNpmPackages: importOptions.installNpmPackages,
  });
  Analytics.setExtraData('num_components', bitIds.length);
  await consumer.onDestroy();
  return { dependencies, envComponents, importDetails, warnings };
}

// TODO: refactor to better use of semver
// TODO: move to bit-javascript
const getSemverType = (str): string | null | undefined => {
  if (semver.valid(str)) return 'V'; // VALID_VERSION
  if (semver.validRange(str)) return 'R'; // RANGE_VERSIONS
  return null;
};

// TODO: refactor to better use of semver
// TODO: move to bit-javascript
function compatibleWith(a: { [key: string]: string }, b: { [key: string]: string }): boolean {
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
function warnForPackageDependencies({ dependencies, consumer, installNpmPackages }): Promise<Record<string, any>> {
  const warnings = {
    notInPackageJson: [],
    notInNodeModules: [],
    notInBoth: [],
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

  const getNameAndVersion = (pj) => ({ [pj.name]: pj.version });
  const nodeModules = R.mergeAll(
    glob.sync(path.join(projectDir, 'node_modules', '*')).map(R.compose(getNameAndVersion, getPackageJson))
  );

  // eslint-disable-next-line
  dependencies.forEach((dep) => {
    if (!dep.packageDependencies || R.isEmpty(dep.packageDependencies)) return null;

    R.forEachObjIndexed((packageDepVersion, packageDepName) => {
      const packageDep = { [packageDepName]: packageDepVersion };
      const compatibleWithPackgeJson = compatibleWith(packageDep, packageJsonDependencies);
      const compatibleWithNodeModules = compatibleWith(packageDep, nodeModules);

      if (!compatibleWithPackgeJson && !compatibleWithNodeModules && !R.contains(packageDep, warnings.notInBoth)) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        warnings.notInBoth.push(packageDep);
      }

      if (
        !compatibleWithPackgeJson &&
        compatibleWithNodeModules &&
        !R.contains(packageDep, warnings.notInPackageJson)
      ) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        warnings.notInPackageJson.push(packageDep);
      }

      if (
        compatibleWithPackgeJson &&
        !compatibleWithNodeModules &&
        !R.contains(packageDep, warnings.notInNodeModules)
      ) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        warnings.notInNodeModules.push(packageDep);
      }
    }, dep.packageDependencies);
  });

  // Remove duplicates warnings for missing packages
  warnings.notInBoth = R.uniq(warnings.notInBoth);

  return Promise.resolve(warnings);
}
