import type { ComponentLoadOptions as LegacyComponentLoadOptions } from '@teambit/legacy.consumer-component';

export type ComponentLoadOptions = LegacyComponentLoadOptions & {
  loadExtensions?: boolean;
  executeLoadSlot?: boolean;
  idsToNotLoadAsAspects?: string[];
  loadSeedersAsAspects?: boolean;
  resolveExtensionsVersions?: boolean;
};
