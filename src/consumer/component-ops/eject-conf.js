// @flow
import path from 'path';
import R from 'ramda';
import ConsumerComponent from '../component/consumer-component';
import ComponentBitJson from '../bit-json';
import { sharedStartOfArray, removeEmptyDir } from '../../utils';
import GeneralError from '../../error/general-error';
import BitMap from '../bit-map';
import EjectNoDir from './exceptions/eject-no-dir';
import ConfigDir from '../bit-map/config-dir';
import { writeDependenciesLinksToDir } from '../../links/link-generator';
import { Consumer } from '..';
import CompilerExtension from '../../extensions/compiler-extension';
import TesterExtension from '../../extensions/tester-extension';
import type { PathOsBased } from '../../utils/path';

export type EjectConfResult = { id: string, ejectedPath: string };

export default (async function ejectConf(
  component: ConsumerComponent,
  consumer: Consumer,
  configDir: ConfigDir,
  override?: boolean = true
): Promise<EjectConfResult> {
  const consumerPath: PathOsBased = consumer.getPath();
  const bitMap: BitMap = consumer.bitMap;
  const oldConfigDir = R.path(['componentMap', 'configDir'], component);
  const componentMap = component.componentMap;
  if (!componentMap) {
    throw new GeneralError('could not find component in the .bitmap file');
  }
  const componentDir = componentMap.getComponentDir();
  if (!componentDir && configDir.isUnderComponentDir) {
    throw new EjectNoDir(component.id.toStringWithoutVersion());
  }
  // In case the user pass a path with the component dir replace it by the {COMPONENT_DIR} DSL
  // (To better support bit move for example)
  if (componentDir) {
    configDir.repalceByComponentDirDSL(componentDir);
  }
  if (!configDir.isUnderComponentDir) {
    const configDirToValidate = _getDirToValidateAgainsetOtherComps(configDir);
    bitMap.validateConfigDir(component.id.toStringWithoutVersion(), configDirToValidate);
  }
  const deleteOldFiles = !!componentMap.configDir && componentMap.configDir !== configDir.linuxDirPath;
  // Passing here the ENV_TYPE as well to make sure it's not removed since we need it later
  const resolvedConfigDir = configDir.getResolved({ componentDir });
  const resolvedConfigDirFullPath = path.normalize(path.join(consumerPath, resolvedConfigDir.dirPath));
  const ejectedCompilerDirectoryP = writeEnvFiles({
    fullConfigDir: resolvedConfigDirFullPath,
    env: component.compiler,
    consumer,
    component,
    deleteOldFiles
  });
  const ejectedTesterDirectoryP = writeEnvFiles({
    fullConfigDir: resolvedConfigDirFullPath,
    env: component.tester,
    consumer,
    component,
    deleteOldFiles
  });
  const [ejectedCompilerDirectory, ejectedTesterDirectory] = await Promise.all([
    ejectedCompilerDirectoryP,
    ejectedTesterDirectoryP
  ]);
  const bitJsonDir = resolvedConfigDir.getEnvTypeCleaned();
  const bitJsonDirFullPath = path.normalize(path.join(consumerPath, bitJsonDir.dirPath));
  const relativeEjectedCompilerDirectory = _getRelativeDir(bitJsonDirFullPath, ejectedCompilerDirectory);
  const relativeEjectedTesterDirectory = _getRelativeDir(bitJsonDirFullPath, ejectedTesterDirectory);

  await writeBitJson(
    component,
    bitJsonDirFullPath,
    relativeEjectedCompilerDirectory,
    relativeEjectedTesterDirectory,
    override
  );
  if (deleteOldFiles) {
    if (oldConfigDir) {
      const oldBitJsonDir = oldConfigDir.getResolved({ componentDir }).getEnvTypeCleaned();
      const oldBitJsonDirFullPath = path.join(consumerPath, oldBitJsonDir.dirPath);
      await ComponentBitJson.removeIfExist(oldBitJsonDirFullPath);
      await removeEmptyDir(oldBitJsonDirFullPath);
    }
  }
  return {
    id: component.id.toStringWithoutVersion(),
    ejectedPath: configDir.linuxDirPath,
    ejectedFullPath: bitJsonDir.linuxDirPath
  };
});

export async function writeEnvFiles({
  fullConfigDir,
  env,
  consumer,
  component,
  deleteOldFiles
}: {
  fullConfigDir: PathOsBased,
  env?: CompilerExtension | TesterExtension,
  consumer: Consumer,
  component: ConsumerComponent,
  deleteOldFiles: boolean
}): Promise<PathOsBased> {
  if (!env) {
    return '';
  }
  const ejectedDirectory = await env.writeFilesToFs({ configDir: fullConfigDir, deleteOldFiles });
  const deps = env instanceof CompilerExtension ? component.compilerDependencies : component.testerDependencies;
  await writeDependenciesLinksToDir(fullConfigDir, component, deps, consumer);
  return ejectedDirectory;
}

const writeBitJson = async (
  component: ConsumerComponent,
  bitJsonDir: string,
  ejectedCompilerDirectory: string,
  ejectedTesterDirectory: string,
  override?: boolean = true
): Promise<ComponentBitJson> => {
  return new ComponentBitJson({
    version: component.version,
    scope: component.scope,
    lang: component.lang,
    bindingPrefix: component.bindingPrefix,
    compiler: component.compiler ? component.compiler.toBitJsonObject(ejectedCompilerDirectory) : {},
    tester: component.tester ? component.tester.toBitJsonObject(ejectedTesterDirectory) : {},
    dependencies: component.dependencies.asWritableObject(),
    devDependencies: component.devDependencies.asWritableObject(),
    packageDependencies: component.packageDependencies,
    devPackageDependencies: component.devPackageDependencies,
    peerPackageDependencies: component.peerPackageDependencies
  }).write({ bitDir: bitJsonDir, override });
};

const _getRelativeDir = (bitJsonDir, envDir) => {
  let res = envDir;
  const sharedStart = sharedStartOfArray([bitJsonDir, envDir]);
  if (sharedStart) {
    res = path.relative(sharedStart, envDir);
  }

  return res;
};

/**
 * get the config dir which needed to be searched in other components to validate there is no conflicts
 * That's means check that the dir is not inside the comp dir
 * and get the dir without the dynamic parts
 * @param {*} configDir
 */
const _getDirToValidateAgainsetOtherComps = (configDir: ConfigDir) => {
  // In case it's inside the component dir it can't conflicts with other comps
  if (configDir.isUnderComponentDir) {
    return null;
  }
  return configDir.getCleaned({ cleanComponentDir: false, cleanEnvType: true }).linuxDirPath;
};
