import { loadConsumerIfExist } from '../../../consumer';
import CapsuleBuilder, { Options } from '../../../environment/capsule-builder';
import { CapsuleOptions } from '../../../extensions/capsule/orchestrator/types';
import CapsuleList from '../../../environment/capsule-list';
import { PackageManager } from '../../../extensions/package-manager';

export default (async function capsuleIsolate(
  bitIds: string[],
  capsuleOptions: CapsuleOptions,
  options: Options
): Promise<CapsuleList> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new Error('no consumer found');
  const capsuleBuilder = new CapsuleBuilder(consumer.getPath(), new PackageManager('librarian'));
  return capsuleBuilder.isolateComponents(bitIds, capsuleOptions, options, consumer);
});
