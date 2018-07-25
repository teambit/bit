// @flow
import path from 'path';
import R from 'ramda';
import format from 'string-format';
import ConsumerComponent from '../component/consumer-component';
import ComponentBitJson from '../bit-json';
import { sharedStartOfArray, removeEmptyDir } from '../../utils';
import GeneralError from '../../error/general-error';
import { COMPONENT_DIR } from '../../constants';

export type EjectConfResult = { id: string, ejectedPath: string };

export default (async function ejectConf(
  component: ConsumerComponent,
  consumerPath: string,
  configDir: string,
  override?: boolean = true
): Promise<EjectConfResult> {
  const oldConfigDir = R.path(['componentMap', 'configDir'], component);
  const componentMap = component.componentMap;
  if (!componentMap) {
    throw new GeneralError('could not find component in the .bitmap file');
  }
  const trackDir = componentMap.getTrackDir();
  if (!trackDir && configDir.includes(`{${COMPONENT_DIR}}`)) {
    throw new GeneralError(
      `could not eject config for ${component.id.toString()}, please provide path which doesn't contain {${COMPONENT_DIR}} to eject`
    );
  }
  // In case the user pass a path with the component dir replace it by the {COMPONENT_DIR} DSL
  // (To better support bit move for example)
  if (trackDir && configDir.startsWith(trackDir)) {
    configDir = configDir.replace(trackDir, `{${COMPONENT_DIR}}`);
  }
  const deleteOldFiles = componentMap.configDir && componentMap.configDir !== configDir;
  // Passing here the ENV_TYPE as well to make sure it's not removed since we need it later
  const resolvedConfigDir = format(configDir, { [COMPONENT_DIR]: trackDir, ENV_TYPE: '{ENV_TYPE}' });
  const resolvedConfigDirFullPath = path.join(consumerPath, resolvedConfigDir);

  const ejectedCompilerDirectoryP = component.compiler
    ? await component.compiler.writeFilesToFs({ configDir: resolvedConfigDirFullPath, deleteOldFiles })
    : '';
  const ejectedTesterDirectoryP = component.tester
    ? await component.tester.writeFilesToFs({ configDir: resolvedConfigDirFullPath, deleteOldFiles })
    : '';
  const [ejectedCompilerDirectory, ejectedTesterDirectory] = await Promise.all([
    ejectedCompilerDirectoryP,
    ejectedTesterDirectoryP
  ]);
  const bitJsonDir = format(resolvedConfigDirFullPath, { ENV_TYPE: '' });
  const relativeEjectedCompilerDirectory = _getRelativeDir(bitJsonDir, ejectedCompilerDirectory);
  const relativeEjectedTesterDirectory = _getRelativeDir(bitJsonDir, ejectedTesterDirectory);

  await writeBitJson(component, bitJsonDir, relativeEjectedCompilerDirectory, relativeEjectedTesterDirectory, override);
  if (deleteOldFiles) {
    if (oldConfigDir) {
      const oldBitJsonDir = format(oldConfigDir, { [COMPONENT_DIR]: trackDir, ENV_TYPE: '' });
      const oldBitJsonDirFullPath = path.join(consumerPath, oldBitJsonDir);
      await ComponentBitJson.removeIfExist(oldBitJsonDirFullPath);
      await removeEmptyDir(oldBitJsonDirFullPath);
    }
  }
  return { id: component.id.toString(), ejectedPath: configDir, ejectedFullPath: bitJsonDir };
});

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
