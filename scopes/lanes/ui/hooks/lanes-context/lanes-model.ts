import { ComponentModel } from '@teambit/component';
import { ScopeModel } from '@teambit/scope.models.scope-model';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';

export const baseLaneRoute = '/~lane';
export const laneComponentIdUrlRegex = '[\\w\\/-]*[\\w-]';
export const laneRouteUrlRegex = `${baseLaneRoute}/:orgId([\\w-]+)/:scopeId([\\w-]+)/:laneId([\\w-]+)`;
export const getLaneUrl = (laneId: string) => `${baseLaneRoute}/${laneId.replace('.', '/')}`;
export const laneComponentUrlRegex = `${laneRouteUrlRegex}/:componentId(${laneComponentIdUrlRegex})`;
export const getLaneComponentUrl = (componentId: ComponentID, laneId?: string) =>
  laneId ? `${getLaneUrl(laneId)}/${componentId.fullName}?version=${componentId.version}` : '';

export type LaneComponentQueryResult = {
  id: ComponentIdObj;
  head: string;
};
export type LaneQueryResult = {
  name: string;
  remote?: string;
  isMerged: boolean;
  components: LaneComponentQueryResult[];
};
export type LanesQueryResult = {
  lanes?: {
    getLanes?: LaneQueryResult[];
    getCurrentLaneName?: string;
  };
};
export type LanesHost = 'workspace' | 'scope';
export type LanesModel = {
  currentLane?: LaneModel;
  lanes?: {
    byScope: Map<string, LaneModel[]>;
    list: LaneModel[];
    byComponentHash: Map<string, { lane: LaneModel; component: LaneComponentModel }>;
  };
};
export type LaneComponentModel = { model: ComponentModel; url: string };
export type LaneModel = {
  id: string;
  scope: string;
  url: string;
  name: string;
  isMerged: boolean | null;
  components: LaneComponentModel[];
};

export function mapToLaneModel(laneData: LaneQueryResult, currentScope: ScopeModel): LaneModel {
  const { name, remote, isMerged } = laneData;
  const laneName = name;
  const laneId = remote || name;
  const laneScope = remote?.split('/')[0] || currentScope.name;

  const components = laneData.components.map((component) => {
    const componentModel = ComponentModel.from({
      id: { ...component.id, version: component.head, scope: component.id.scope || laneScope },
      displayName: component.id.name,
      compositions: [],
      packageName: '',
      description: '',
    });
    return { model: componentModel, url: getLaneComponentUrl(componentModel.id, laneId) };
  });

  return {
    id: laneId,
    name: laneName,
    scope: laneScope || currentScope.name,
    isMerged,
    url: getLaneUrl(laneId),
    components,
  };
}

export function groupByScope(lanes: LaneModel[]): Map<string, LaneModel[]> {
  return lanes.reduce((accum, next) => {
    const { scope } = next;
    if (!accum.has(scope)) {
      accum.set(scope, [next]);
    } else {
      const existing = accum.get(scope) as LaneModel[];
      accum.set(scope, [...existing, next]);
    }
    return accum;
  }, new Map<string, LaneModel[]>());
}

export function groupByComponentHash(
  lanes: LaneModel[]
): Map<string, { lane: LaneModel; component: LaneComponentModel }> {
  return lanes.reduce((accum, lane) => {
    const { components } = lane;
    components.forEach((component) => {
      accum.set(component.model.id.version as string, { lane, component });
    });
    return accum;
  }, new Map<string, { lane: LaneModel; component: LaneComponentModel }>());
}

export function mapToLanesModel(lanesData: LanesQueryResult, currentScope: ScopeModel): LanesModel {
  const lanesResult = lanesData.lanes?.getLanes || [];
  const currentLaneName = lanesData.lanes?.getCurrentLaneName;
  const laneModel = lanesResult.map((result) => mapToLaneModel(result, currentScope));
  const lanesByScope = groupByScope(laneModel);
  const lanesByComponentHash = groupByComponentHash(laneModel);
  const currentLane = laneModel.find((lane) => lane.name === currentLaneName);
  const lanes = {
    byScope: lanesByScope,
    list: laneModel,
    byComponentHash: lanesByComponentHash,
  };
  return {
    lanes,
    currentLane,
  };
}
