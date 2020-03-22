import * as path from 'path';
import ConsumerComponent from '../component/consumer-component';
import ComponentConfig from '../config';
import Consumer from '../consumer';
import ShowDoctorError from '../../error/show-doctor-error';
import GeneralError from '../../error/general-error';
import { PathOsBased } from '../../utils/path';
import DataToPersist from '../component/sources/data-to-persist';

export type EjectConfResult = { id: string; ejectedPath: PathOsBased };
export type EjectConfData = { id: string; ejectedPath: string; dataToPersist: DataToPersist };

export default (async function ejectConf(component: ConsumerComponent, consumer: Consumer): Promise<EjectConfResult> {
  const { id, ejectedPath, dataToPersist } = await getEjectConfDataToPersist(component, consumer);
  dataToPersist.addBasePath(consumer.getPath());
  await dataToPersist.persistAllToFS();
  return {
    id,
    ejectedPath
  };
});

export async function getEjectConfDataToPersist(
  component: ConsumerComponent,
  consumer: Consumer
): Promise<EjectConfData> {
  const componentMap = component.componentMap;
  if (!componentMap) {
    throw new ShowDoctorError('could not find component in the .bitmap file');
  }
  const componentDir = componentMap.getComponentDir();
  if (!componentDir) {
    throw new GeneralError('could not eject config for a component without a root dir');
  }

  const id = component.id.toStringWithoutVersion();

  const consumerPath: PathOsBased = consumer.getPath();
  const bitJsonDirFullPath = path.normalize(path.join(consumerPath, componentDir));
  const bitJson = getBitJsonToWrite(component);
  const jsonFilesToWrite = await bitJson.prepareToWrite({
    workspaceDir: consumer.getPath(),
    componentDir
  });
  const dataToPersist = new DataToPersist();
  dataToPersist.addManyFiles(jsonFilesToWrite);

  return {
    id,
    ejectedPath: componentDir,
    dataToPersist
  };
}

function getBitJsonToWrite(component: ConsumerComponent): ComponentConfig {
  const componentConfig = ComponentConfig.fromComponent(component);
  componentConfig.compiler = component.compiler ? component.compiler.toBitJsonObject() : {};
  componentConfig.tester = component.tester ? component.tester.toBitJsonObject() : {};
  return componentConfig;
}
