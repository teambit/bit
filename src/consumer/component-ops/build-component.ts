import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';
import Vinyl from 'vinyl';

import Capsule from '../../../legacy-capsule/core/capsule';
import { DEFAULT_DIST_DIRNAME } from '../../constants';
import IsolatedEnvironment from '../../environment';
import Isolator from '../../environment/isolator';
import GeneralError from '../../error/general-error';
import { CompilerResults } from '../../legacy-extensions/compiler-api';
import ExtensionIsolateResult from '../../legacy-extensions/extension-isolate-result';
import logger from '../../logger/logger';
import { Scope } from '../../scope';
import ComponentWithDependencies from '../../scope/component-dependencies';
import { isString } from '../../utils';
import { PathLinux } from '../../utils/path';
import ComponentMap from '../bit-map/component-map';
import ConsumerComponent from '../component/consumer-component';
import ExternalBuildErrors from '../component/exceptions/external-build-errors';
import InvalidCompilerInterface from '../component/exceptions/invalid-compiler-interface';
import PackageJsonFile from '../component/package-json-file';
import { Dist } from '../component/sources';
import Dists from '../component/sources/dists';
import Consumer from '../consumer';

type BuildResults = {
  builtFiles: Vinyl[];
  mainDist?: string;
  packageJson?: Record<string, any>;
};

export default (async function buildComponent({
  component,
  scope,
  save, // this is true only when originated from `runAndUpdateCI()`
  consumer,
  noCache,
  directory,
  verbose,
  dontPrintEnvMsg,
  keep,
}: {
  component: ConsumerComponent;
  scope: Scope;
  save?: boolean;
  consumer?: Consumer;
  noCache?: boolean;
  directory?: string;
  verbose?: boolean;
  dontPrintEnvMsg?: boolean;
  keep?: boolean;
}): Promise<Dists | undefined> {
  logger.debug(`consumer-component.build ${component.id.toString()}`);
  // @TODO - write SourceMap Type
  if (!component.compiler) {
    if (!consumer || consumer.shouldDistsBeInsideTheComponent()) {
      logger.debug('compiler was not found, nothing to build');
      return undefined;
    }
    logger.debugAndAddBreadCrumb(
      'build-component.buildComponent',
      'compiler was not found, however, because the dists are set to be outside the components directory, save the source file as dists'
    );
    component.copyFilesIntoDists();
    return component.dists;
  }

  const bitMap = consumer ? consumer.bitMap : undefined;
  const consumerPath = consumer ? consumer.getPath() : '';
  const componentMap = bitMap && bitMap.getComponentIfExist(component.id);
  let componentDir = consumerPath;
  if (componentMap) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    componentDir = consumerPath && componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : undefined;
  }
  const needToRebuild = await _isNeededToReBuild(consumer, component, noCache);
  if (!needToRebuild && !component.dists.isEmpty()) {
    logger.debugAndAddBreadCrumb(
      'build-component.buildComponent',
      'skip the build process as the component was not modified, use the dists saved in the model'
    );
    return component.dists;
  }
  logger.debug('compiler found, start building');
  if (component.compiler && !component.compiler.loaded) {
    await component.compiler.install(
      scope,
      { verbose: !!verbose, dontPrintEnvMsg },
      { workspaceDir: consumerPath, componentDir, dependentId: component.id }
    );
  }

  const compilerResults: BuildResults = await _build({
    component,
    consumer,
    componentMap,
    scope,
    keep,
    directory,
    verbose: !!verbose,
  });
  const { builtFiles, mainDist, packageJson } = compilerResults;
  builtFiles.forEach((file) => {
    if (file && (!file.contents || !isString(file.contents.toString()))) {
      throw new GeneralError('builder interface has to return object with a code attribute that contains string');
    }
  });
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  component.setDists(
    // @ts-ignore
    builtFiles.map((file) => new Dist(file)),
    mainDist
  );
  if (save) {
    await scope.sources.updateDist({ source: component });
  }
  if (packageJson && !R.isEmpty(packageJson)) {
    await _updateComponentPackageJson(component, packageJson);
    component.packageJsonChangedProps = Object.assign(component.packageJsonChangedProps || {}, packageJson);
  }
  return component.dists;
});

async function _updateComponentPackageJson(
  component: ConsumerComponent,
  packageJsonPropsToAdd: Record<string, any>
): Promise<void> {
  const componentPackageJsonFile = component.packageJsonFile;
  if (!componentPackageJsonFile) {
    logger.debug(
      `ignore compiler packageJson result as the component ${component.id.toString()} does not have a package.json file`
    );
    return;
  }
  componentPackageJsonFile.mergePackageJsonObject(packageJsonPropsToAdd);
  // When running in capsule there is no workspace dir, so no need to update the package.json
  if (componentPackageJsonFile.workspaceDir) {
    await componentPackageJsonFile.write();
  }
}

function _extractAndVerifyCompilerResults(
  compilerResults: CompilerResults
): {
  builtFiles: Vinyl[];
  mainDist: string | null | undefined;
  packageJson: Record<string, any> | null | undefined;
} {
  if (Array.isArray(compilerResults)) {
    return { builtFiles: compilerResults, mainDist: null, packageJson: null };
  }
  if (typeof compilerResults === 'object') {
    // @ts-ignore yes, it should not contain files, it's only a verification
    if (compilerResults.files && !compilerResults.dists) {
      // previously, the new compiler "action" method expected to get "files", suggest to replace with 'dists'.
      throw new GeneralError('fatal: compiler returned "files" instead of "dists", please change it to "dists"');
    }
    if (!compilerResults.dists) {
      throw new GeneralError('fatal: compiler that returns an object, must include "dists" property');
    }
    if (compilerResults.packageJson) {
      _verifyPackageJsonReturnedByCompiler(compilerResults.packageJson);
    }
    return {
      builtFiles: compilerResults.dists,
      mainDist: compilerResults.mainFile,
      packageJson: compilerResults.packageJson,
    };
  }
  throw new GeneralError(`fatal: compiler must return an array or object, instead, got ${typeof compilerResults}`);
}

function _verifyPackageJsonReturnedByCompiler(packageJson: Record<string, any>) {
  if (typeof packageJson !== 'object') {
    throw new GeneralError(`fatal: compiler must return packageJson as an object, got ${typeof packageJson}`);
  }
  PackageJsonFile.propsNonUserChangeable().forEach((prop) => {
    if (packageJson[prop]) {
      throw new GeneralError(`fatal: compiler must not return packageJson with "${prop}" property`);
    }
  });
}

async function _build({
  component,
  consumer,
  componentMap,
  scope,
  verbose,
  directory,
  keep,
}: {
  component: ConsumerComponent;
  consumer?: Consumer;
  componentMap?: ComponentMap | null | undefined;
  scope: Scope;
  verbose: boolean;
  directory?: string | null | undefined;
  keep: boolean | null | undefined;
}): Promise<BuildResults> {
  const compiler = component.compiler;

  if (!compiler) {
    throw new GeneralError('compiler was not found, nothing to build');
  }

  if (!compiler.action && !compiler.oldAction) {
    throw new InvalidCompilerInterface(compiler.name);
  }

  const runBuildParams = { component, consumer, scope, componentMap, verbose };
  if (consumer) {
    return _runBuild({ ...runBuildParams, componentRoot: consumer.getPath() });
  }
  if (component.isolatedEnvironment) {
    return _runBuild({ ...runBuildParams, componentRoot: component.writtenPath });
  }

  const isolatedEnvironment = new IsolatedEnvironment(scope, directory);
  try {
    await isolatedEnvironment.create();
    const isolateOpts = {
      verbose,
      installNpmPackages: true,
      writePackageJson: true,
    };
    const componentWithDependencies = await isolatedEnvironment.isolateComponent(component.id, isolateOpts);
    const isolatedComponent = componentWithDependencies.component;
    const result = await _runBuild({ ...runBuildParams, componentRoot: isolatedComponent.writtenPath });
    if (!keep) await isolatedEnvironment.destroy();
    return result;
  } catch (err) {
    await isolatedEnvironment.destroy();
    throw err;
  }
}

// Ideally it's better to use the dists from the model.
// If there is no consumer, it comes from the scope or isolated environment, which the dists are already saved.
// If there is consumer, check whether the component was modified. If it wasn't, no need to re-build.
async function _isNeededToReBuild(
  consumer: Consumer | null | undefined,
  component: ConsumerComponent,
  noCache: boolean | null | undefined
): Promise<boolean> {
  if (noCache) return true;
  if (!consumer) return false;
  const componentStatus = await consumer.getComponentStatusById(component.id);
  if (componentStatus.modified) return true;
  const areDependenciesChangedP = component.dependencies.getAllIds().map(async (dependencyId) => {
    const dependencyStatus = await consumer.getComponentStatusById(dependencyId);
    return dependencyStatus.modified;
  });
  const areDependenciesChanged = await Promise.all(areDependenciesChangedP);
  return areDependenciesChanged.some((isDependencyChanged) => isDependencyChanged);
}

async function _runBuild({
  component,
  componentRoot,
  consumer,
  scope,
  componentMap,
  verbose,
}: {
  component: ConsumerComponent;
  componentRoot?: PathLinux;
  consumer?: Consumer;
  scope: Scope;
  componentMap: ComponentMap | null | undefined;
  verbose: boolean;
}): Promise<BuildResults> {
  const compiler = component.compiler;
  if (!compiler) {
    throw new GeneralError('compiler was not found, nothing to build');
  }

  let rootDistDir = componentRoot ? path.join(componentRoot, DEFAULT_DIST_DIRNAME) : undefined;
  const consumerPath = consumer ? consumer.getPath() : '';
  const files = component.files.map((file) => file.clone());
  let tmpFolderFullPath;

  let componentDir = '';
  if (componentMap) {
    const rootDistDirRelative = component.dists.getDistDir(consumer, componentMap.getRootDir());
    if (consumer) rootDistDir = consumer.toAbsolutePath(rootDistDirRelative);
    if (consumerPath && componentMap.getComponentDir()) {
      componentDir = componentMap.getComponentDir() || '';
    }
  }
  // TODO: merge with the same function in consumer-component file
  let shouldBuildUponDependenciesChanges;
  const isolateFunc = async ({
    targetDir,
    shouldBuildDependencies,
    installNpmPackages,
    keepExistingCapsule,
  }: {
    targetDir?: string;
    shouldBuildDependencies?: boolean;
    installNpmPackages?: boolean;
    keepExistingCapsule?: boolean;
  }): Promise<{ capsule: Capsule; componentWithDependencies: ComponentWithDependencies }> => {
    shouldBuildUponDependenciesChanges = shouldBuildDependencies;
    const isolator = await Isolator.getInstance('fs', scope, consumer, targetDir);
    const componentWithDependencies = await isolator.isolate(component.id, {
      shouldBuildDependencies,
      writeDists: false,
      installNpmPackages,
      keepExistingCapsule,
    });
    return new ExtensionIsolateResult(isolator, componentWithDependencies);
  };

  const context: Record<string, any> = {
    componentObject: component.toObject(),
    rootDistDir,
    componentDir,
    isolate: isolateFunc,
  };
  const getBuildResults = async () => {
    try {
      // Change the cwd to make sure we found the needed files
      if (componentRoot) {
        process.chdir(componentRoot);
      }
      if (compiler.action) {
        const actionParams = {
          files,
          rawConfig: compiler.rawConfig,
          dynamicConfig: compiler.dynamicConfig,
          api: compiler.api,
          context,
        };
        const result = await Promise.resolve(compiler.action(actionParams));
        if (tmpFolderFullPath) {
          if (verbose) {
            console.log(`\ndeleting tmp directory ${tmpFolderFullPath}`); // eslint-disable-line no-console
          }
          logger.info(`build-components, deleting ${tmpFolderFullPath}`);
          await fs.remove(tmpFolderFullPath);
        }
        return result;
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return compiler.oldAction(files, rootDistDir, context);
    } catch (e) {
      if (tmpFolderFullPath) {
        logger.info(`build-components, deleting ${tmpFolderFullPath}`);
        fs.removeSync(tmpFolderFullPath);
      }
      // Some time an external tool might return a complex object or an array of errors
      // See for example this issue: https://github.com/teambit/bit/issues/2023#issuecomment-534952085
      // (The Vue compiler will return an object with different fields such as details, missing, origin, dependencies, module, name, error)
      const errors = e.errors || (e.error ? [e.error] : [e]);
      const err = new ExternalBuildErrors(component.id.toString(), errors);
      throw err;
    }
  };
  const buildResults = await getBuildResults();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return { ..._extractAndVerifyCompilerResults(buildResults), shouldBuildUponDependenciesChanges };
}
