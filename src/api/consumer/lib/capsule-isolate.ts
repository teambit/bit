import { loadConsumerIfExist } from '../../../consumer';
import CapsuleBuilder, { Options } from '../../../environment/capsule-builder';
import { CapsuleOptions } from '../../../extensions/capsule/orchestrator/types';
import { ComponentCapsule } from '../../../extensions/capsule-ext';

export default (async function capsuleIsolate(
  bitIds: string[],
  capsuleOptions: CapsuleOptions,
  options: Options
): Promise<{ [bitId: string]: ComponentCapsule }> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new Error('no consumer found');
  const capsuleBuilder = new CapsuleBuilder(consumer.getPath());
  return capsuleBuilder.isolateComponents(bitIds, capsuleOptions, options, consumer);
});
