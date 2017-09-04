/** @flow */
import includes from "lodash.includes";
import R from "Ramda";
import BitMap from "../../../consumer/bit-map";
import {loadConsumer, Consumer} from "../../../consumer";
import ComponentsList from "../../../consumer/component/components-list";


export default async function untrack(componentIds: string[]): Promise<Object> {

  const untrackedComponents = [];
  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents(true);
  const stagedComponents = await componentsList.listExportPendingComponents();
  const modifiedComponent = await componentsList.listModifiedComponents(true);

  //find missing
  const  missing = componentIds.filter(id => !bitMap.getComponent(id,false))

  //remove new components
  newComponents.forEach(newComp => {
    if (includes(componentIds,newComp.id.toString()) || R.isEmpty(componentIds)) {
      untrackedComponents.push(newComp.id.toString())
      bitMap.removeComponent(newComp.id.toString())
    }
  });

  //check if ids are staged
  const unRemovableStagedComponents = stagedComponents.filter(component => includes(componentIds,component));

  //check if ids are modified
  const unRemovableModifiedComponents = modifiedComponent.filter(component => includes(componentIds,component));
  const unremovableMerged = unRemovableStagedComponents.concat(unRemovableModifiedComponents);

  await bitMap.write();
  return { untrackedComponents, unRemovableComponents: unremovableMerged, missingComponents: missing } ;

}
