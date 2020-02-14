import { loadConsumerIfExist } from '../../../consumer';
import CapsuleBuilder, { Options } from '../../../environment/capsule-builder';
import { CapsuleOptions } from '../../../extensions/capsule/orchestrator/types';
import CapsuleList from '../../../environment/capsule-list';

export default (async function capsuleIsolate(
  bitIds: string[],
  capsuleOptions: CapsuleOptions,
  options: Options
): Promise<CapsuleList> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new Error('no consumer found');
  const capsuleBuilder = new CapsuleBuilder(consumer.getPath());
  return capsuleBuilder.isolateComponents(bitIds, capsuleOptions, options, consumer);
});
