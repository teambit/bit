import { ComponentModel, ComponentModelProps } from '@teambit/component';
import { LaneId } from '@teambit/lane-id';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { affix } from '@teambit/base-ui.utils.string.affix';
import { pathToRegexp } from 'path-to-regexp';
/**
 * GQL (lanes/getLanes/components)
 * Return type of each Component in a Lane
 */
export type LaneComponentQueryResult = {
  id: ComponentIdObj;
  head: string;
};
/**
 * GQL
 *  lanes/list
 *  lanes/current
 * Return type of each Lane in a Scope/Workspace
 */
export type LaneQueryResult = {
  id: { name: string; scope: string };
  remote?: string;
  isMerged: boolean;
  components: ComponentModelProps[];
  readmeComponent?: ComponentModelProps;
  hash: string;
};
/**
 * GQL
 * Return type of the lanes query
 */
export type LanesQueryResult = {
  list?: LaneQueryResult[];
  current?: LaneQueryResult;
};
/**
 * GQL (lanes)
 * Return type of the entire /lanes query.
 * Represents All Lanes and Current Lane in Scope/Workspace
 */
export type LanesQuery = {
  lanes?: LanesQueryResult;
};

export type LanesHost = 'workspace' | 'scope';
// export type LaneComponentModel = { model: ComponentModel; url: string };
/**
 * Represents a single Lane in a Workspace/Scope
 */
export type LaneModel = {
  id: LaneId;
  hash: string;
  components: ComponentModel[];
  readmeComponent?: ComponentModel;
};
/**
 * Props to instantiate a LanesModel
 */
export type LanesModelProps = {
  lanes?: LaneModel[];
  viewedLane?: LaneModel;
  currentLane?: LaneModel;
};

/**
 * Represents the entire Lanes State in a Workspace/Scope
 * Provides helper methods to extract and map Lane information
 * Keeps track of all the lanes and the currently selected lane from the UI
 */
export class LanesModel {
  static lanesPrefix = '~lane';
  static baseLaneComponentRoute = '/~component';
  static lanePath = ':scopeId/:laneId';

  static drawer = {
    id: 'LANES',
    name: 'LANES',
    order: 100,
  };

  private static laneFromPathRegex = pathToRegexp(`${LanesModel.lanesPrefix}/${LanesModel.lanePath}`, undefined, {
    end: false,
    start: false,
  });

  static getLaneIdFromPathname = (pathname: string): LaneId | undefined => {
    const matches = LanesModel.laneFromPathRegex.exec(pathname);
    if (!matches) return undefined;
    const [, scopeId, laneId] = matches;
    return LaneId.from(laneId, scopeId);
  };

  static getLaneUrl = (laneId: LaneId) => `/${LanesModel.lanesPrefix}/${laneId.toString()}`;

  static getLaneComponentUrl = (componentId: ComponentID, laneId: LaneId) => {
    const laneUrl = LanesModel.getLaneUrl(laneId);
    const urlSearch = affix('?version=', componentId.version);

    return `${laneUrl}${LanesModel.baseLaneComponentRoute}/${componentId.fullName}${urlSearch}`;
  };

  static mapToLaneModel(laneData: LaneQueryResult, host: string): LaneModel {
    const { id, components, readmeComponent, hash } = laneData;

    const componentModels =
      components?.map((component) => {
        const componentModel = ComponentModel.from({ ...component, host });
        return componentModel;
      }) || [];

    const readmeComponentModel = readmeComponent && ComponentModel.from({ ...readmeComponent, host });

    return {
      id: LaneId.from(id.name, id.scope),
      components: componentModels,
      readmeComponent: readmeComponentModel,
      hash,
    };
  }

  static groupByScope(lanes: LaneModel[]): Map<string, LaneModel[]> {
    const grouped = new Map<string, LaneModel[]>();
    lanes.forEach((lane) => {
      const { id } = lane;
      const { scope } = id;
      if (!grouped.has(scope)) {
        grouped.set(scope, [lane]);
      } else {
        const existing = grouped.get(scope) as LaneModel[];
        grouped.set(scope, [...existing, lane]);
      }
    });
    return grouped;
  }

  static groupByComponentHashAndId(lanes: LaneModel[]): {
    byHash: Map<string, { lane: LaneModel; component: ComponentModel }>;
    byId: Map<string, LaneModel[]>;
  } {
    const byHash = new Map<string, { lane: LaneModel; component: ComponentModel }>();
    const byId = new Map<string, LaneModel[]>();
    lanes.forEach((lane) => {
      const { components } = lane;
      components.forEach((component) => {
        const id = component.id.fullName;
        const version = component.id.version as string;
        byHash.set(version, { lane, component });
        const existing = byId.get(id) || [];
        existing.push(lane);
        byId.set(id, existing);
      });
    });
    return { byHash, byId };
  }

  static from({ data, host, viewedLaneId }: { data: LanesQuery; host: string; viewedLaneId?: LaneId }): LanesModel {
    const lanes = data?.lanes?.list?.map((lane) => LanesModel.mapToLaneModel(lane, host)) || [];
    const currentLane = data.lanes?.current?.id
      ? lanes.find((lane) => lane.id.isEqual(data.lanes?.current?.id as LaneId))
      : undefined;
    const lanesModel = new LanesModel({ lanes, currentLane });
    lanesModel.setViewedLane(viewedLaneId);
    return lanesModel;
  }

  constructor({ lanes, viewedLane, currentLane }: LanesModelProps) {
    this.viewedLane = viewedLane;
    this.currentLane = currentLane;
    this.lanes = lanes || [];
    this.lanesByScope = LanesModel.groupByScope(this.lanes);
    const { byHash, byId } = LanesModel.groupByComponentHashAndId(this.lanes);
    this.lanebyComponentHash = byHash;
    this.lanesByComponentId = byId;
  }

  readonly lanesByScope: Map<string, LaneModel[]>;
  readonly lanebyComponentHash: Map<string, { lane: LaneModel; component: ComponentModel }>;
  readonly lanesByComponentId: Map<string, LaneModel[]>;

  viewedLane?: LaneModel;
  currentLane?: LaneModel;
  readonly lanes: LaneModel[];

  isInViewedLane = (componentId: ComponentID) =>
    this.viewedLane?.components.some((comp) => comp.id.name === componentId.name);

  getLaneComponentUrlByVersion = (version?: string) => {
    if (!version) return '';
    const componentAndLane = this.lanebyComponentHash.get(version);
    if (!componentAndLane) return '';
    return LanesModel.getLaneComponentUrl(componentAndLane.component.id, componentAndLane.lane.id);
  };

  getLanesByComponentId = (componentId: ComponentID) => this.lanesByComponentId.get(componentId.fullName);
  getLaneByComponentVersion = (componentId: ComponentID) =>
    componentId.version ? this.lanebyComponentHash.get(componentId.version) : undefined;

  setViewedLane = (viewedLaneId?: LaneId) => {
    this.viewedLane = viewedLaneId ? this.lanes.find((lane) => lane.id.isEqual(viewedLaneId)) : undefined;
  };
  resolveComponent = (fullName: string, laneId?: string) =>
    ((laneId && this.lanes.find((lane) => lane.id.toString() === laneId)) || this.viewedLane)?.components.find(
      (component) => component.id.fullName === fullName
    );
  getDefaultLane = () => this.lanes.find((lane) => lane.id.isDefault());
}
