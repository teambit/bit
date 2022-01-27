import { ComponentModel } from '@teambit/component';

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

export function mapToLaneModel(laneData: LaneQueryResult): LaneModel {
  const { name, remote, isMerged } = laneData;
  const laneName = name;
  const fullName = remote || name;
  const scope = remote?.split('/')[0] || '';
  const components = laneData.components.map((component) =>
    ComponentModel.from({
      id: {
        name: component.id,
        version: component.head,
        scope,
      },
      displayName: component.id,
      compositions: [],
      packageName: '',
      description: '',
    })
  );
  return { name: fullName, laneName, scope, isMerged, components };
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

export function mapToLanesState(lanesData: LanesQueryResult): LanesModel {
  const laneResult = lanesData.lanes?.getLanes || [];
  const currentLaneName = lanesData.lanes?.getCurrentLaneName;
  const laneModel = laneResult.map(mapToLaneModel);
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
