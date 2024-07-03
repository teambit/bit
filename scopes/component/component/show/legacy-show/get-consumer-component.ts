import { Consumer, loadConsumer } from '@teambit/legacy/dist/consumer';
import { NothingToCompareTo } from './nothing-to-compare-to';

export async function getConsumerComponent({
  id,
  compare,
  allVersions,
}: {
  id: string;
  compare: boolean;
  allVersions: boolean | null | undefined;
}) {
  const consumer: Consumer = await loadConsumer();
  const bitId = consumer.getParsedId(id);
  if (allVersions) {
    return consumer.loadAllVersionsOfComponentFromModel(bitId);
  }
  const component = await consumer.loadComponent(bitId); // loads recent component
  if (compare) {
    if (!component.componentFromModel) throw new NothingToCompareTo(id);
    return { component, componentModel: component.componentFromModel };
  }
  await consumer.onDestroy('get-component');
  return { component };
}
