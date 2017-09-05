/** @flow */
import includes from "lodash.includes";
import R from "ramda";
import BitMap from "../../../consumer/bit-map";
import {loadConsumer, Consumer} from "../../../consumer";
import ComponentsList from "../../../consumer/component/components-list";


export default async function untrack(componentIds: string[]): Promise<Object> {
  const untrackedComponents = [];
  var missing = [] ,unRemovableComponents = [];
  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents(true);

  //remove new components
  newComponents.forEach(newComp => {
    if (includes(componentIds,newComp.id.toString()) || R.isEmpty(componentIds)) {
      untrackedComponents.push(newComp.id.toString());
      bitMap.removeComponent(newComp.id.toString());
    }
  });

  if (!R.isEmpty(componentIds)) {
    //find missing
    missing = componentIds.filter(id => !bitMap.getComponent(id,false));

    //find untrackable
    const merged = untrackedComponents.concat(missing);
    unRemovableComponents = merged.filter( componentId => (componentIds.indexOf(componentId) < 0) );
  }
  await bitMap.write();
  return { untrackedComponents, unRemovableComponents, missingComponents: missing } ;

}
