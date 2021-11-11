import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { StorageResolver } from './storage-resolver';
import { StorageResolverSlot } from '../builder.main.runtime';

export class StorageResolverPlugin implements PluginDefinition<StorageResolver> {
  constructor(private storageSlot: StorageResolverSlot) {}

  pattern = '*.storage-resolver.*';

  runtimes = [MainRuntime.name];

  register(storageResolver: StorageResolver) {
    return this.storageSlot.register(storageResolver);
  }
}
