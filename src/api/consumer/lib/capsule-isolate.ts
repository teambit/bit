import { loadConsumerIfExist } from '../../../consumer';
import Network, { Options } from '../../../extensions/network/network';
import capsuleOrchestrator from '../../../extensions/network/orchestrator/orchestrator';
import { CapsuleOptions } from '../../../extensions/network/orchestrator/types';
import CapsuleList from '../../../extensions/capsule/capsule-list';
import { PackageManager } from '../../../extensions/package-manager';

export default (async function capsuleIsolate(
  bitIds: string[],
  capsuleOptions: CapsuleOptions,
  options: Options
): Promise<CapsuleList> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new Error('no consumer found');
  await capsuleOrchestrator.buildPools();
  const network = new Network(capsuleOrchestrator, new PackageManager('librarian'));
  // const capsuleBuilder = new Network(consumer.getPath(), new PackageManager('librarian'));
  return network.create(bitIds, capsuleOptions, options, consumer);
  // return capsuleBuilder.isolateComponents(bitIds, capsuleOptions, options, consumer);
});
