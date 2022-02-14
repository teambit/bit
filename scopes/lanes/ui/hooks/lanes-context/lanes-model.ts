import { ComponentModel } from '@teambit/component';
import { ScopeModel } from '@teambit/scope.models.scope-model';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';

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
export type LaneComponentModel = { model: ComponentModel; url: string };
export type LaneModel = {
  id: string;
  scope: string;
  url: string;
  name: string;
  isMerged: boolean | null;
  components: LaneComponentModel[];
};
export type LanesModelProps = {
  lanes: LaneModel[];
  currentLane?: LaneModel;
};

export class LanesModel {
  static baseLaneRoute = '/~lane';

  static laneRouteUrlRegex = `${LanesModel.baseLaneRoute}/:orgId([\\w-]+)/:scopeId([\\w-]+)/:laneId([\\w-]+)`;

  static laneComponentIdUrlRegex = '[\\w\\/-]*[\\w-]';
  static laneComponentUrlRegex = `${LanesModel.laneRouteUrlRegex}/:componentId(${LanesModel.laneComponentIdUrlRegex})`;
  static getLaneUrlFromPathname: (pathname: string) => string | undefined = (pathname) => {
    const [, maybeLaneId] = pathname.split(LanesModel.baseLaneRoute);
    if (!maybeLaneId) return undefined;
    const [, ...laneId] = maybeLaneId.split('/');
    return `${LanesModel.baseLaneRoute}/${laneId.slice(0, 3).join('/')}`;
  };
  static getLaneUrl = (laneId: string) => `${LanesModel.baseLaneRoute}/${laneId.replace('.', '/')}`;
  static getLaneComponentUrl = (componentId: ComponentID, laneId?: string) =>
    laneId ? `${LanesModel.getLaneUrl(laneId)}/${componentId.fullName}?version=${componentId.version}` : '';

  static mapToLaneModel(laneData: LaneQueryResult, currentScope: ScopeModel): LaneModel {
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
      return { model: componentModel, url: LanesModel.getLaneComponentUrl(componentModel.id, laneId) };
    });

    return {
      id: laneId,
      name: laneName,
      scope: laneScope || currentScope.name,
      isMerged,
      url: LanesModel.getLaneUrl(laneId),
      components,
    };
  }

  static groupByScope(lanes: LaneModel[]): Map<string, LaneModel[]> {
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

  static groupByComponentHash(lanes: LaneModel[]): Map<string, { lane: LaneModel; component: LaneComponentModel }> {
    return lanes.reduce((accum, lane) => {
      const { components } = lane;
      components.forEach((component) => {
        accum.set(component.model.id.version as string, { lane, component });
      });
      return accum;
    }, new Map<string, { lane: LaneModel; component: LaneComponentModel }>());
  }

  static from(lanesData: LanesQueryResult, currentScope: ScopeModel): LanesModel {
    const lanesResult = lanesData.lanes?.getLanes || [];
    const currentLaneName = lanesData.lanes?.getCurrentLaneName;
    const lanes = lanesResult.map((result) => LanesModel.mapToLaneModel(result, currentScope));
    const currentLane = lanes.find((lane) => lane.name === currentLaneName);
    return new LanesModel({ lanes, currentLane });
  }

  constructor({ lanes, currentLane }: LanesModelProps) {
    this.currentLane = currentLane;
    this.lanes = lanes;
    this.lanesByScope = LanesModel.groupByScope(lanes);
    this.lanebyComponentHash = LanesModel.groupByComponentHash(lanes);
  }

  readonly lanesByScope: Map<string, LaneModel[]>;
  readonly lanebyComponentHash: Map<string, { lane: LaneModel; component: LaneComponentModel }>;
  readonly currentLane?: LaneModel;
  readonly lanes: LaneModel[];
}
