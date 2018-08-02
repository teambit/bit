// @flow
import path from 'path';
import R from 'ramda';
import format from 'string-format';
import ConsumerComponent from '../component/consumer-component';
import ComponentBitJson from '../bit-json';
import { sharedStartOfArray, removeEmptyDir, pathNormalizeToLinux } from '../../utils';
import GeneralError from '../../error/general-error';
import { COMPONENT_DIR } from '../../constants';
import BitMap from '../bit-map';
import EjectNoDir from './exceptions/eject-no-dir';

export type EjectConfResult = { id: string, ejectedPath: string };

export default (async function ejectConf(
  component: ConsumerComponent,
  consumerPath: string,
  bitMap: BitMap,
  configDir: string,
  override?: boolean = true
): Promise<EjectConfResult> {
  const oldConfigDir = R.path(['componentMap', 'configDir'], component);
  const componentMap = component.componentMap;
  let linuxConfigDir = pathNormalizeToLinux(configDir);
  if (!componentMap) {
    throw new GeneralError('could not find component in the .bitmap file');
  }
  const trackDir = componentMap.getTrackDir();
  if (!trackDir && linuxConfigDir.includes(`{${COMPONENT_DIR}}`)) {
    throw new EjectNoDir(component.id.toStringWithoutVersion());
  }
  // In case the user pass a path with the component dir replace it by the {COMPONENT_DIR} DSL
  // (To better support bit move for example)
  if (trackDir && linuxConfigDir.startsWith(trackDir)) {
    linuxConfigDir = linuxConfigDir.replace(trackDir, `{${COMPONENT_DIR}}`);
  }
  if (!linuxConfigDir.startsWith(`{${COMPONENT_DIR}}`)) {
    const configDirToValidate = _getDirToValidateAgainsetOtherComps(linuxConfigDir);
    bitMap.validateConfigDir(component.id.toStringWithoutVersion(), configDirToValidate);
  }
  const deleteOldFiles = !!componentMap.configDir && componentMap.configDir !== linuxConfigDir;
  // Passing here the ENV_TYPE as well to make sure it's not removed since we need it later
  const resolvedConfigDir = format(linuxConfigDir, { [COMPONENT_DIR]: trackDir, ENV_TYPE: '{ENV_TYPE}' });
  const resolvedConfigDirFullPath = path.normalize(path.join(consumerPath, resolvedConfigDir));
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
  return { id: component.id.toStringWithoutVersion(), ejectedPath: linuxConfigDir, ejectedFullPath: bitJsonDir };
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

/**
 * get the config dir which needed to be searched in other components to validate there is no conflicts
 * That's means check that the dir is not inside the comp dir
 * and get the dir without the dynamic parts
 * @param {*} configDir
 */
const _getDirToValidateAgainsetOtherComps = (configDir) => {
  // In case it's inside the component dir it can't conflicts with other comps
  if (configDir.startsWith(`{${COMPONENT_DIR}}`)) {
    return null;
  }
  return format(configDir, { ENV_TYPE: '' });
};
