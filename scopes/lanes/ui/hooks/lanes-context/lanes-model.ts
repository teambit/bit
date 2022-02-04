import { ComponentModel } from '@teambit/component';
import { ScopeModel } from '@teambit/scope.models.scope-model';

export const baseLaneRoute = `/~lane`;
export const laneRouteUrl = `${baseLaneRoute}/:laneId([[\\w\\/\\.-]+[\\w\\/\\.-])`;
export const laneComponentUrl = `${laneRouteUrl}/:compId([[\\w\\/-]+[\\w\\/-])`;
export type LaneComponentQueryResult = {
  id: string;
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
  host?: LanesHost;
  currentLane?: LaneModel;
  lanes?: {
    byScope: Map<string, LaneModel[]>;
    list: LaneModel[];
    byComponentHash: Map<string, { lane: LaneModel; component: ComponentModel }>;
  };
};
export type LaneModel = {
  id: string;
  scope: string;
  name: string;
  isMerged: boolean | null;
  components: ComponentModel[];
};

export function mapToLaneModel(laneData: LaneQueryResult, currentScope: ScopeModel, host: LanesHost): LaneModel {
  const { name, remote, isMerged } = laneData;
  const laneName = name;
  const fullName = remote || name;
  const laneScope = remote?.split('/')[0];
  const components = laneData.components.map((component) => {
    const componentName = getLaneComponentName(component, host);
    const componentScope = laneScope || currentScope.name;
    const componentModel = ComponentModel.from({
      id: {
        name: componentName,
        version: component.head,
        scope: componentScope,
      },
      displayName: component.id,
      compositions: [],
      packageName: '',
      description: '',
    });
    return componentModel;
  });
  return { id: fullName, name: laneName, scope: laneScope || currentScope.name, isMerged, components };
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

export function groupByComponentHash(lanes: LaneModel[]): Map<string, { lane: LaneModel; component: ComponentModel }> {
  return lanes.reduce((accum, lane) => {
    const { components } = lane;
    components.forEach((component) => {
      accum.set(component.id.version as string, { lane, component });
    });
    return accum;
  }, new Map<string, { lane: LaneModel; component: ComponentModel }>());
}

export function mapToLanesModel(lanesData: LanesQueryResult, currentScope: ScopeModel, host: LanesHost): LanesModel {
  const lanesResult = lanesData.lanes?.getLanes || [];
  const currentLaneName = lanesData.lanes?.getCurrentLaneName;
  const laneModel = lanesResult.map((result) => mapToLaneModel(result, currentScope, host));
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
    host,
  };
}

function getLaneComponentName(laneComponent: LaneComponentQueryResult, host?: LanesHost) {
  if (host === 'scope') return laneComponent.id.replace('.', '/');
  const hasIdBeenExported = laneComponent.id.includes('.');
  return hasIdBeenExported
    ? laneComponent.id.split('/').reduce((accum, next, index) => {
        if (index === 1) {
          return `${next}`;
        }
        if (index > 1) {
          return `${accum}/${next}`;
        }
        return accum;
      }, '')
    : laneComponent.id;
}
