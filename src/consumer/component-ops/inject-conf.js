// @flow
import path from 'path';
import format from 'string-format';
import ConsumerComponent from '../component/consumer-component';
import ComponentBitJson from '../bit-json';
import { removeEmptyDir, pathNormalizeToLinux } from '../../utils';
import GeneralError from '../../error/general-error';
import { COMPONENT_DIR } from '../../constants';
import BitMap from '../bit-map';

export type InjectConfResult = { id: string };

export default (async function injectConf(
  component: ConsumerComponent,
  consumerPath: string,
  bitMap: BitMap,
  configDir: string,
  force?: boolean = false
): Promise<InjectConfResult> {
  const componentMap = component.componentMap;
  const linuxConfigDir = pathNormalizeToLinux(configDir);
  if (!componentMap) {
    throw new GeneralError('could not find component in the .bitmap file');
  }
  const trackDir = componentMap.getTrackDir();

  // TODO: check if files were modified before deleting them and delete them only if forces provided
  if (!force) {
    // To implement
    // Check if config files changed
    // If yes throw error
  }

  // Passing here the ENV_TYPE as well to make sure it's not removed since we need it later
  const resolvedConfigDir = format(linuxConfigDir, { [COMPONENT_DIR]: trackDir, ENV_TYPE: '{ENV_TYPE}' });
  const resolvedConfigDirFullPath = path.normalize(path.join(consumerPath, resolvedConfigDir));

  const deleteCompilerFilesP = component.compiler ? component.compiler.removeFilesFromFs() : Promise.resolve('');
  const deleteTesterFilesP = component.tester ? component.tester.removeFilesFromFs() : Promise.resolve('');

  await Promise.all([deleteCompilerFilesP, deleteTesterFilesP]);

  // Delete bit.json and bit.json dir
  const bitJsonDir = format(resolvedConfigDirFullPath, { ENV_TYPE: '' });
  await ComponentBitJson.removeIfExist(bitJsonDir);
  await removeEmptyDir(bitJsonDir);

  return { id: component.id.toStringWithoutVersion() };
});
