import { loadConsumerIfExist } from '../../../consumer';
import Isolator from '../../../extensions/isolator/isolator';
import CapsuleList from '../../../extensions/isolator/capsule-list';
import { PackageManager } from '../../../extensions/package-manager';
import { Reporter } from '../../../extensions/reporter';

export default (async function capsuleIsolate(bitIds: string[], capsuleOptions: {}): Promise<CapsuleList> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new Error('no consumer found');
  const reporter = new Reporter();
  const packageManager = new PackageManager(consumer.config.workspaceSettings.packageManager, reporter);
  const network = await Isolator.provide([packageManager]);
  const isolatedEnvironment = await network.createNetworkFromConsumer(bitIds, consumer, capsuleOptions);
  return isolatedEnvironment.capsules;
});
