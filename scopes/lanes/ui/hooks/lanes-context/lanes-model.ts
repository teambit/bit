import { ComponentModel } from '@teambit/component';
import { ScopeModel } from '@teambit/scope.models.scope-model';

export const lanesRouteUrl = `/~lanes/:laneId([[\\w\\/\\.-]+[\\w\\/\\.-])`;

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
export type LanesModel = {
  currentLane?: LaneModel;
  lanes?: {
    byScope: Map<string, LaneModel[]>;
    list: LaneModel[];
  };
};
export type LaneModel = {
  name: string;
  scope: string;
  laneName: string;
  isMerged: boolean | null;
  components: ComponentModel[];
};

export function mapToLaneModel(laneData: LaneQueryResult, scope: ScopeModel): LaneModel {
  const { name, remote, isMerged } = laneData;
  const laneName = name;
  const fullName = remote || name;
  const scopeName = remote?.split('/')[0] || scope.name;

  const components = laneData.components.map((component) => {
    const componentModel = ComponentModel.from({
      id: {
        name: component.id,
        version: component.head,
        scope: scopeName,
      },
      displayName: component.id,
      compositions: [],
      packageName: '',
      description: '',
    });
    return componentModel;
  });
  return { name: fullName, laneName, scope: scopeName, isMerged, components };
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

export function mapToLanesState(lanesData: LanesQueryResult, scope: ScopeModel): LanesModel {
  const laneResult = lanesData.lanes?.getLanes || [];
  const currentLaneName = lanesData.lanes?.getCurrentLaneName;
  const laneModel = laneResult.map((result) => mapToLaneModel(result, scope));
  const lanesByScope = groupByScope(laneModel);
  const currentLane = laneModel.find((lane) => lane.name === currentLaneName);
  const lanes = {
    byScope: lanesByScope,
    list: laneModel,
  };
  return {
    lanes,
    currentLane,
  };
}
