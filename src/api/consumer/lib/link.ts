import { BitId } from '@teambit/legacy-bit-id';
import { Consumer, loadConsumer } from '../../../consumer';
import { changeCodeFromRelativeToModulePaths } from '../../../consumer/component-ops/codemod-components';
import { linkAllToNodeModules } from '../../../links';

export default async function linkAction(ids: string[], changeRelativeToModulePaths: boolean) {
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map((id) => consumer.getParsedId(id));
  return link(consumer, bitIds, changeRelativeToModulePaths);
}

export async function link(consumer: Consumer, bitIds: BitId[], changeRelativeToModulePaths: boolean) {
  let codemodResults;
  if (changeRelativeToModulePaths) {
    codemodResults = await changeCodeFromRelativeToModulePaths(consumer, bitIds);
  }
  const linksResults = await linkAllToNodeModules(consumer, bitIds);
  return { linksResults, codemodResults };
}
