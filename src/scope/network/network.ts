import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { PushOptions, FETCH_OPTIONS } from '@teambit/legacy.scope-api';
import Component from '../../consumer/component';
import { ListScopeResult } from '../../consumer/component/components-list';
import DependencyGraph from '../graph/scope-graph';
import { LaneData } from '../lanes/lanes';
import { ComponentLog } from '../models/model-component';
import { ObjectItemsStream, ObjectList } from '../objects/object-list';
import RemovedObjects from '../removed-components';
import { ScopeDescriptor } from '../scope';

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
  list(namespacesUsingWildcards?: string): Promise<ListScopeResult[]>;
  show(bitId: ComponentID): Promise<Component | null | undefined>;
  log(id: ComponentID): Promise<ComponentLog[]>;
  latestVersions(bitIds: ComponentIdList): Promise<string[]>;
  graph(bitId?: ComponentID): Promise<DependencyGraph>;
  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]>;
  hasObjects(hashes: string[]): Promise<string[]>;
}
