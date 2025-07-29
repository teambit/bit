import type { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { PushOptions, FETCH_OPTIONS } from '@teambit/legacy.scope-api';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { ListScopeResult } from '@teambit/legacy.component-list';
import type { DependencyGraph } from '@teambit/legacy.dependency-graph';
import type { ComponentLog, ObjectItemsStream, ObjectList } from '@teambit/objects';
import type { LaneData, ScopeDescriptor, RemovedObjects } from '@teambit/legacy.scope';

export interface Network {
  // @todo: this causes ts errors in the ssh class for some reason
  // connect(host: string): Promise<any>;
  close(): void;
  describeScope(): Promise<ScopeDescriptor>;
  deleteMany(
    ids: string[],
    force: boolean,
    context: Record<string, any>,
    idsAreLanes: boolean
  ): Promise<RemovedObjects>;
  fetch(ids: string[], fetchOptions: FETCH_OPTIONS, context?: Record<string, any>): Promise<ObjectItemsStream>;
  pushMany(objectList: ObjectList, pushOptions: PushOptions, context?: Record<string, any>): Promise<string[]>;
  action<Options extends Record<string, any>, Result>(name: string, options: Options): Promise<Result>;
  list(namespacesUsingWildcards?: string, includeDeleted?: boolean): Promise<ListScopeResult[]>;
  show(bitId: ComponentID): Promise<ConsumerComponent | null | undefined>;
  log(id: ComponentID): Promise<ComponentLog[]>;
  latestVersions(bitIds: ComponentIdList): Promise<string[]>;
  graph(bitId?: ComponentID): Promise<DependencyGraph>;
  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]>;
  hasObjects(hashes: string[]): Promise<string[]>;
}
