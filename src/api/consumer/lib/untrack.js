/** @flow */
import includes from 'lodash.includes';
import BitMap from '../../../consumer/bit-map';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';


export default async function untrack(componentPaths: string[]): Promise<Object> {

  const componentsToUntrack = componentPaths;
  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents(true);
  const modifiedComponent = await componentsList.listModifiedComponents(true);
  const stagedComponents = await componentsList.listExportPendingComponents();

  //remove added components
  newComponents.forEach(newComp => {
    if (includes(componentPaths,newComp.id.toString())) bitMap.removeComponent(newComp.id.toString())
  });

  //remove staged components only if is local component and not imported
  stagedComponents.forEach(newComp => {
    if (includes(componentPaths,newComp.id.toString())) bitMap.removeComponent(newComp.id.toString())
  });


return null;

}
