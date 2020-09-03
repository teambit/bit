import * as path from 'path';
import R from 'ramda';

import { COMPILER_ENV_TYPE, TESTER_ENV_TYPE } from '../../constants';
import GeneralError from '../../error/general-error';
import ShowDoctorError from '../../error/show-doctor-error';
import removeEmptyDir from '../../utils/fs/remove-empty-dir';
import ConsumerComponent from '../component/consumer-component';
import { AbstractVinyl } from '../component/sources';
import ComponentConfig from '../config';

export type InjectConfResult = { id: string };

/**
 * the opposite of 'eject-conf'.
 * delete configuration files on the fs.
 */
export default (async function injectConf(
  component: ConsumerComponent,
  consumerPath: string,
  force = false
): Promise<InjectConfResult> {
  const componentMap = component.componentMap;
  if (!componentMap) {
    throw new ShowDoctorError('could not find component in the .bitmap file');
  }
  const componentDir = componentMap.getComponentDir();

  if (!componentDir) {
    throw new GeneralError('unable to inject-conf for a component without root directory');
  }

  if (!force && areEnvsModified(component, component.componentFromModel)) {
    throw new GeneralError(
      'unable to inject-conf, some or all configuration files are modified. please use "--force" flag to force removing the configuration files'
    );
  }

  // Delete bit.json
  const bitJsonDirFullPath = path.normalize(path.join(consumerPath, componentDir));
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
  return envTypes.some((envType) => {
    const fsHashes = // $FlowFixMe
      componentFromFs[envType] && componentFromFs[envType].files
        ? componentFromFs[envType].files.map((file: AbstractVinyl) => file.toSourceAsLinuxEOL().hash()).sort()
        : [];
    const modelHashes = // $FlowFixMe
      componentFromModel[envType] && componentFromModel[envType].files
        ? componentFromModel[envType].files.map((file) => file.file.hash()).sort()
        : [];
    return !R.equals(fsHashes, modelHashes);
  });
}
