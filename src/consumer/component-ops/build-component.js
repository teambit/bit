// @flow
import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import Vinyl from 'vinyl';
import Dists from '../component/sources/dists';
import type ConsumerComponent from '../component/consumer-component';
import type { Scope } from '../../scope';
import InvalidCompilerInterface from '../component/exceptions/invalid-compiler-interface';
import IsolatedEnvironment from '../../environment';
import ComponentMap from '../bit-map/component-map';
import { BitId } from '../../bit-id';
import logger from '../../logger/logger';
import { DEFAULT_DIST_DIRNAME } from '../../constants';
import ExternalBuildErrors from '../component/exceptions/external-build-errors';
import type Consumer from '../consumer';
import type { PathLinux } from '../../utils/path';
import { isString } from '../../utils';
import GeneralError from '../../error/general-error';
import { Dist, AbstractVinyl } from '../component/sources';
import { writeEnvFiles } from './eject-conf';
import Isolator from '../../environment/isolator';
import Capsule from '../../../components/core/capsule';
import ComponentWithDependencies from '../../scope/component-dependencies';
import type { CompilerResults } from '../../extensions/compiler-api';
import PackageJsonFile from '../component/package-json-file';
import DataToPersist from '../component/sources/data-to-persist';
import { getComponentsDependenciesLinks } from '../../links/link-generator';

export default (async function buildComponent({
  component,
  scope,
  save, // this is true only when originated from `runAndUpdateCI()`
  consumer,
  noCache,
  directory,
  verbose,
  dontPrintEnvMsg,
  keep
}: {
  component: ConsumerComponent,
  scope: Scope,
  save?: boolean,
  consumer?: Consumer,
  noCache?: boolean,
  directory?: string,
  verbose?: boolean,
  dontPrintEnvMsg?: boolean,
  keep?: boolean
}): Promise<?Dists> {
  logger.debug(`consumer-component.build ${component.id.toString()}`);
  // @TODO - write SourceMap Type
  if (!component.compiler) {
    if (!consumer || consumer.shouldDistsBeInsideTheComponent()) {
      logger.debug('compiler was not found, nothing to build');
      return null;
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
    componentDir = consumerPath && componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : undefined;
  }
  const needToRebuild = await _isNeededToReBuild(consumer, component.id, noCache);
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

  const compilerResults =
    (await _buildIfNeeded({
      component,
      consumer,
      componentMap,
      scope,
      keep,
      directory,
      verbose: !!verbose
    })) || [];
  const { builtFiles, mainDist, packageJson } = _extractAndVerifyCompilerResults(compilerResults);
  builtFiles.forEach((file) => {
    if (file && (!file.contents || !isString(file.contents.toString()))) {
      throw new GeneralError('builder interface has to return object with a code attribute that contains string');
    }
  });
  component.setDists(builtFiles.map(file => new Dist(file)), mainDist);
  if (save) {
    await scope.sources.updateDist({ source: component });
  }
  if (packageJson && !R.isEmpty(packageJson)) {
    await _updateComponentPackageJson(component, packageJson);
    component.packageJsonChangedProps = Object.assign(component.packageJsonChangedProps || {}, packageJson);
  }
  return component.dists;
});

async function _updateComponentPackageJson(component: ConsumerComponent, packageJsonPropsToAdd: Object): Promise<void> {
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
): { builtFiles: Vinyl[], mainDist: ?string, packageJson: ?Object } {
  if (Array.isArray(compilerResults)) {
    return { builtFiles: compilerResults, mainDist: null, packageJson: null };
  }
  if (typeof compilerResults === 'object') {
    // $FlowFixMe
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
      packageJson: compilerResults.packageJson
    };
  }
  throw new GeneralError(`fatal: compiler must return an array or object, instead, got ${typeof compilerResults}`);
}

function _verifyPackageJsonReturnedByCompiler(packageJson: Object) {
  if (typeof packageJson !== 'object') {
    throw new GeneralError(`fatal: compiler must return packageJson as an object, got ${typeof packageJson}`);
  }
  PackageJsonFile.propsNonUserChangeable().forEach((prop) => {
    if (packageJson[prop]) {
      throw new GeneralError(`fatal: compiler must not return packageJson with "${prop}" property`);
    }
  });
}

async function _buildIfNeeded({
  component,
  consumer,
  componentMap,
  scope,
  verbose,
  directory,
  keep
}: {
  component: ConsumerComponent,
  consumer?: Consumer,
  componentMap?: ?ComponentMap,
  scope: Scope,
  verbose: boolean,
  directory?: ?string,
  keep: ?boolean
}): Promise<CompilerResults> {
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
    // $FlowFixMe
    return _runBuild({ ...runBuildParams, componentRoot: component.writtenPath });
  }

  const isolatedEnvironment = new IsolatedEnvironment(scope, directory);
  try {
    await isolatedEnvironment.create();
    const isolateOpts = {
      verbose,
      installPackages: true,
      noPackageJson: false
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
const _isNeededToReBuild = async (consumer: ?Consumer, componentId: BitId, noCache: ?boolean): Promise<boolean> => {
  // Forcly rebuild
  if (noCache) return true;
  if (!consumer) return false;
  const componentStatus = await consumer.getComponentStatusById(componentId);
  return componentStatus.modified;
};

const _runBuild = async ({
  component,
  componentRoot,
  consumer,
  scope,
  componentMap,
  verbose
}: {
  component: ConsumerComponent,
  componentRoot: PathLinux,
  consumer: ?Consumer,
  scope: Scope,
  componentMap: ?ComponentMap,
  verbose: boolean
}): Promise<CompilerResults> => {
  const compiler = component.compiler;
  if (!compiler) {
    throw new GeneralError('compiler was not found, nothing to build');
  }

  let rootDistDir = path.join(componentRoot, DEFAULT_DIST_DIRNAME);
  const consumerPath = consumer ? consumer.getPath() : '';
  const files = component.files.map(file => file.clone());
  let tmpFolderFullPath;

  let componentDir = '';
  if (componentMap) {
    const rootDistDirRelative = component.dists.getDistDir(consumer, componentMap.getRootDir());
    if (consumer) rootDistDir = consumer.toAbsolutePath(rootDistDirRelative);
    if (consumerPath && componentMap.getComponentDir()) {
      componentDir = componentMap.getComponentDir() || '';
    }
  }
  return Promise.resolve()
    .then(async () => {
      if (!compiler.action && !compiler.oldAction) {
        throw new InvalidCompilerInterface(compiler.name);
      }

      const isolateFunc = async ({
        targetDir,
        shouldBuildDependencies
      }: {
        targetDir?: string,
        shouldBuildDependencies?: boolean
      }): Promise<{ capsule: Capsule, componentWithDependencies: ComponentWithDependencies }> => {
        const isolator = await Isolator.getInstance('fs', scope, consumer, targetDir);
        const componentWithDependencies = await isolator.isolate(component.id, {
          shouldBuildDependencies,
          dist: false
        });
        const writeDists = async (builtFiles, mainDist): Promise<void> => {
          const capsuleComponent: ConsumerComponent = componentWithDependencies.component;
          capsuleComponent.setDists(builtFiles.map(file => new Dist(file)), mainDist);
          // $FlowFixMe result is not null here because the dists exist
          const distsToWrite: DataToPersist = await capsuleComponent.dists.getDistsToWrite(
            capsuleComponent,
            isolator.capsuleBitMap,
            null,
            true,
            componentWithDependencies
          );
          distsToWrite.persistAllToCapsule(isolator.capsule);
        };
        const getDependenciesLinks = (): Vinyl[] => {
          const links = getComponentsDependenciesLinks(
            [componentWithDependencies],
            null,
            false,
            isolator.capsuleBitMap
          );
          return links.files;
        };
        const addSharedDir = (filesToAdd: Vinyl[]): Vinyl[] => {
          const sharedDir = componentWithDependencies.component.originallySharedDir;
          let updatedFiles = filesToAdd;
          if (sharedDir) {
            updatedFiles = filesToAdd.map((file) => {
              const fileAsAbstractVinyl = AbstractVinyl.fromVinyl(file);
              fileAsAbstractVinyl.updatePaths({ newRelative: path.join(sharedDir, file.relative) });
              return fileAsAbstractVinyl;
            });
          }
          return updatedFiles;
        };
        const installPackages = async (packages: string[] = []) => {
          await isolator.installPackagesOnRoot(packages);
          // after installing packages on capsule root, some links/symlinks from node_modules might
          // be deleted. rewrite the links to recreate them.
          await isolator.writeLinksOnNodeModules();
        };
        const capsuleFiles = componentWithDependencies.component.files;
        return {
          capsule: isolator.capsule,
          capsuleFiles,
          componentWithDependencies,
          writeDists,
          getDependenciesLinks,
          writeLinks: () => isolator.writeLinks(),
          capsuleExec: (cmd, options) => isolator.capsuleExec(cmd, options),
          installPackages,
          addSharedDir
        };
      };

      const context: Object = {
        componentObject: component.toObject(),
        rootDistDir,
        componentDir,
        isolate: isolateFunc
      };

      // Change the cwd to make sure we found the needed files
      process.chdir(componentRoot);
      if (compiler.action) {
        const isCompilerDetached = await component.getDetachedCompiler(consumer);
        const shouldWriteConfig = compiler.writeConfigFilesOnAction && isCompilerDetached;
        // Write config files to tmp folder
        if (shouldWriteConfig) {
          tmpFolderFullPath = component.getTmpFolder(consumerPath);
          if (verbose) {
            console.log(`\nwriting config files to ${tmpFolderFullPath}`); // eslint-disable-line no-console
          }
          await writeEnvFiles({
            configDir: component.getTmpFolder(),
            env: compiler,
            consumer,
            component,
            deleteOldFiles: false,
            verbose
          });
        }

        const actionParams = {
          files,
          rawConfig: compiler.rawConfig,
          dynamicConfig: compiler.dynamicConfig,
          configFiles: compiler.files,
          api: compiler.api,
          context
        };
        // $FlowFixMe we verified above that action is set
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
      if (!compiler.oldAction) {
        throw new InvalidCompilerInterface(compiler.name);
      }
      return Promise.resolve(compiler.oldAction(files, rootDistDir, context));
    })
    .catch((e) => {
      if (tmpFolderFullPath) {
        logger.info(`build-components, deleting ${tmpFolderFullPath}`);
        fs.removeSync(tmpFolderFullPath);
      }
      const errors = e.errors || [e];
      const err = new ExternalBuildErrors(component.id.toString(), errors);
      throw err;
    });
};
