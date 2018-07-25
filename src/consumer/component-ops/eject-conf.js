// @flow
import path from 'path';
import format from 'string-format';
import ConsumerComponent from '../component/consumer-component';
import ComponentBitJson from '../bit-json';
import { sharedStartOfArray } from '../../utils';

export type EjectConfResult = { id: string, ejectedPath: string };

export default (async function ejectConf(
  component: ConsumerComponent,
  configDir: string,
  override?: boolean = true
): Promise<EjectConfResult> {
  const ejectedCompilerDirectoryP = component.compiler ? await component.compiler.writeFilesToFs({ configDir }) : '';
  const ejectedTesterDirectoryP = component.tester ? await component.tester.writeFilesToFs({ configDir }) : '';
  const [ejectedCompilerDirectory, ejectedTesterDirectory] = await Promise.all([
    ejectedCompilerDirectoryP,
    ejectedTesterDirectoryP
  ]);
  const bitJsonDir = format(configDir, { ENV_TYPE: '' });
  const relativeEjectedCompilerDirectory = _getRelativeDir(bitJsonDir, ejectedCompilerDirectory);
  const relativeEjectedTesterDirectory = _getRelativeDir(bitJsonDir, ejectedTesterDirectory);

  await writeBitJson(component, bitJsonDir, relativeEjectedCompilerDirectory, relativeEjectedTesterDirectory, override);
  return { id: component.id.toString(), ejectedPath: bitJsonDir };
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
