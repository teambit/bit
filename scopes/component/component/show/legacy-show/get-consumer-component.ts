import type { Consumer } from '@teambit/legacy.consumer';
import { loadConsumer } from '@teambit/legacy.consumer';
import { NothingToCompareTo } from './nothing-to-compare-to';

export async function getConsumerComponent({ id, compare }: { id: string; compare: boolean }) {
  const consumer: Consumer = await loadConsumer();
  const bitId = consumer.getParsedId(id);
  const component = await consumer.loadComponent(bitId); // loads recent component
  if (compare) {
    if (!component.componentFromModel) throw new NothingToCompareTo(id);
    return { component, componentModel: component.componentFromModel };
  }
  await consumer.onDestroy('get-component');
  return { component };
}
