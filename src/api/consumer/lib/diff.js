// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import ComponentsList from '../../../consumer/component/components-list';
import GeneralError from '../../../error/general-error';
import componentsDiff from '../../../consumer/component-ops/components-diff';

export default (async function diff(ids: string[]): Promise<any> {
  const consumer: Consumer = await loadConsumer();
  // if no id was entered, get all modified components
  const getIds = async () => {
    if (ids.length) {
      return ids.map(id => BitId.parse(id));
    }
    const componentsList = new ComponentsList(consumer);
    return componentsList.listModifiedComponents();
  };
  const bitIds = await getIds();
  if (!bitIds || !bitIds.length) {
    throw new GeneralError('there are no modified components to show diff for');
  }
  return componentsDiff(consumer, bitIds);
});
