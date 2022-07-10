import R from 'ramda';
import { BitId, BitIds } from '../bit-id';
import Consumer from '../consumer/consumer';
import NodeModuleLinker, { LinksResult } from './node-modules-linker';

export async function linkAllToNodeModules(consumer: Consumer, bitIds: BitId[] = []): Promise<LinksResult[]> {
  const componentsIds = bitIds.length ? BitIds.fromArray(bitIds) : consumer.bitMap.getAllIdsAvailableOnLane();
  if (R.isEmpty(componentsIds)) return [];
  const { components } = await consumer.loadComponents(componentsIds);
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  return nodeModuleLinker.link();
}
