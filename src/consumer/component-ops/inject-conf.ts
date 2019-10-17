import * as path from 'path';
import R from 'ramda';
import ConsumerComponent from '../component/consumer-component';
import ComponentConfig from '../config';
import removeEmptyDir from '../../utils/fs/remove-empty-dir';
import GeneralError from '../../error/general-error';
import BitMap from '../bit-map';
import ConfigDir from '../bit-map/config-dir';
import { AbstractVinyl } from '../component/sources';
import { COMPILER_ENV_TYPE, TESTER_ENV_TYPE } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';

export type InjectConfResult = { id: string };

/**
 * the opposite of 'eject-conf'.
 * delete configuration files on the fs.
 */
export default (async function injectConf(
  component: ConsumerComponent,
  consumerPath: string,
  bitMap: BitMap,
  configDir: ConfigDir,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  force? = false
): Promise<InjectConfResult> {
  const componentMap = component.componentMap;
  if (!componentMap) {
    throw new ShowDoctorError('could not find component in the .bitmap file');
  }
  const componentDir = componentMap.getComponentDir();

  if (!force && areEnvsModified(component, component.componentFromModel)) {
    throw new GeneralError(
      'unable to inject-conf, some or all configuration files are modified. please use "--force" flag to force removing the configuration files'
    );
  }

  // Passing here the ENV_TYPE as well to make sure it's not removed since we need it later
  const resolvedConfigDir = configDir.getResolved({ componentDir });
  const deleteCompilerFilesP = component.compiler
    ? component.compiler.removeFilesFromFs(component.compilerDependencies, configDir, COMPILER_ENV_TYPE, consumerPath)
    : Promise.resolve('');
  const deleteTesterFilesP = component.tester
    ? component.tester.removeFilesFromFs(component.testerDependencies, configDir, TESTER_ENV_TYPE, consumerPath)
    : Promise.resolve('');

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await Promise.all([deleteCompilerFilesP, deleteTesterFilesP]);

  // Delete bit.json and bit.json dir
  const bitJsonDir = resolvedConfigDir.getEnvTypeCleaned();
  const bitJsonDirFullPath = path.normalize(path.join(consumerPath, bitJsonDir.dirPath));
  await ComponentConfig.removeIfExist(bitJsonDirFullPath);
  await removeEmptyDir(bitJsonDirFullPath);

  return { id: component.id.toStringWithoutVersion() };
});

/**
 * returns whether the envs configuration files were modified on the filesystem
 */
function areEnvsModified(componentFromFs: ConsumerComponent, componentFromModel: ConsumerComponent | null | undefined) {
  if (!componentFromModel) return false;
  const envTypes = [COMPILER_ENV_TYPE, TESTER_ENV_TYPE];
  return envTypes.some(envType => {
    const fsHashes = // $FlowFixMe
      componentFromFs[envType] && componentFromFs[envType].files
        ? componentFromFs[envType].files.map((file: AbstractVinyl) => file.toSourceAsLinuxEOL().hash()).sort()
        : [];
    const modelHashes = // $FlowFixMe
      componentFromModel[envType] && componentFromModel[envType].files
        ? componentFromModel[envType].files.map(file => file.file.hash()).sort()
        : [];
    return !R.equals(fsHashes, modelHashes);
  });
}
