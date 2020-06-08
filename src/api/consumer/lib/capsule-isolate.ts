import { loadConsumerIfExist } from '../../../consumer';
import Isolator from '../../../extensions/isolator/isolator';
import CapsuleList from '../../../extensions/isolator/capsule-list';
import { PackageManager } from '../../../extensions/package-manager';
import { Logger } from '../../../extensions/logger';
import { DEFAULT_PACKAGE_MANAGER } from '../../../constants';

export default (async function capsuleIsolate(bitIds: string[], capsuleOptions: {}): Promise<CapsuleList> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new Error('no consumer found');
  const logger = new Logger();
  const packageManager = new PackageManager(DEFAULT_PACKAGE_MANAGER, logger);
  const network = await Isolator.provide([packageManager]);
  const isolatedEnvironment = await network.createNetworkFromConsumer(bitIds, consumer, capsuleOptions);
  return isolatedEnvironment.capsules;
});
