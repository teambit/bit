// @flow
import path from 'path';
import ConsumerComponent from '../component/consumer-component';
import ComponentBitJson from '../bit-json';
import { removeEmptyDir } from '../../utils';
import GeneralError from '../../error/general-error';
import BitMap from '../bit-map';
import ConfigDir from '../bit-map/config-dir';
import { COMPILER_ENV_TYPE } from '../../extensions/compiler-extension';
import { TESTER_ENV_TYPE } from '../../extensions/tester-extension';

export type InjectConfResult = { id: string };

export default (async function injectConf(
  component: ConsumerComponent,
  consumerPath: string,
  bitMap: BitMap,
  configDir: ConfigDir,
  force?: boolean = false
): Promise<InjectConfResult> {
  const componentMap = component.componentMap;
  if (!componentMap) {
    throw new GeneralError('could not find component in the .bitmap file');
  }
  const componentDir = componentMap.getComponentDir();

  // TODO: check if files were modified before deleting them and delete them only if forces provided
  if (!force) {
    // To implement
    // Check if config files changed
    // If yes throw error
  }

  // Passing here the ENV_TYPE as well to make sure it's not removed since we need it later
  const resolvedConfigDir = configDir.getResolved({ componentDir });
  const deleteCompilerFilesP = component.compiler
    ? component.compiler.removeFilesFromFs(component.compilerDependencies, configDir, COMPILER_ENV_TYPE, consumerPath)
    : Promise.resolve('');
  const deleteTesterFilesP = component.tester
    ? component.tester.removeFilesFromFs(component.testerDependencies, configDir, TESTER_ENV_TYPE, consumerPath)
    : Promise.resolve('');

  await Promise.all([deleteCompilerFilesP, deleteTesterFilesP]);

  // Delete bit.json and bit.json dir
  const bitJsonDir = resolvedConfigDir.getEnvTypeCleaned();
  const bitJsonDirFullPath = path.normalize(path.join(consumerPath, bitJsonDir.dirPath));
  await ComponentBitJson.removeIfExist(bitJsonDirFullPath);
  await removeEmptyDir(bitJsonDirFullPath);

  return { id: component.id.toStringWithoutVersion() };
});
