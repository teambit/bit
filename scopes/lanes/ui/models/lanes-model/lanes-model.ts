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
  laneComponentIds: Array<ComponentIdObj>;
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
  components: ComponentID[];
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
  static laneUrlParamsKey = 'lane';

  private static laneFromPathRegex = pathToRegexp(`${LanesModel.lanesPrefix}/${LanesModel.lanePath}`, undefined, {
    end: false,
    start: false,
  });

  static getLaneIdFromPathname = (pathname: string, urlSearchParams?: URLSearchParams): LaneId | undefined => {
    const matches = LanesModel.laneFromPathRegex.exec(pathname);
    if (matches) {
      const [, scopeId, laneId] = matches;
      return LaneId.from(laneId, scopeId);
    }
    if (urlSearchParams) {
      const laneIdQueryParam = urlSearchParams.get(LanesModel.laneUrlParamsKey);
      return laneIdQueryParam ? LaneId.parse(laneIdQueryParam) : undefined;
    }

    return undefined;
  };

  static getLaneUrl = (laneId: LaneId, relative?: boolean) =>
    `${relative ? '' : '/'}${LanesModel.lanesPrefix}/${laneId.toString()}`;

  static getLaneComponentUrl = (componentId: ComponentID, laneId: LaneId) => {
    const isExternalComponent = componentId.scope !== laneId.scope;

    const laneUrl = LanesModel.getLaneUrl(laneId);
    const urlSearch = affix('?version=', componentId.version);

    if (!isExternalComponent) {
      return `${laneUrl}${LanesModel.baseLaneComponentRoute}/${componentId.fullName}${urlSearch}`;
    }

    return `${laneUrl}${LanesModel.baseLaneComponentRoute}/${componentId.toStringWithoutVersion()}${urlSearch}`;
  };

  static getMainComponentUrl = (componentId: ComponentID, laneId?: LaneId) => {
    const componentUrl = componentId.fullName;
    const urlSearch = affix(`?${LanesModel.laneUrlParamsKey}=`, laneId?.toString());
    return `${componentUrl}${urlSearch}`;
  };

  static mapToLaneModel(laneData: LaneQueryResult, host: string): LaneModel {
    const { id, laneComponentIds, readmeComponent, hash } = laneData;

    const componentIds =
      laneComponentIds?.map((laneComponentId) => {
        const componentId = ComponentID.fromObject(laneComponentId);
        return componentId;
      }) || [];

    const readmeComponentModel = readmeComponent && ComponentModel.from({ ...readmeComponent, host });

    return {
      id: LaneId.from(id.name, id.scope),
      components: componentIds,
      readmeComponent: readmeComponentModel,
      hash,
    };
  }

  static groupByScope(laneIds: LaneId[]): Map<string, LaneId[]> {
    const grouped = new Map<string, LaneId[]>();
    laneIds.forEach((laneId) => {
      const { scope } = laneId;
      if (!grouped.has(scope)) {
        grouped.set(scope, [laneId]);
      } else {
        const existing = grouped.get(scope) as LaneId[];
        grouped.set(scope, [...existing, laneId]);
      }
    });
    return grouped;
  }

  static groupByComponentNameAndId(lanes: LaneModel[]): {
    byName: Map<string, LaneModel[]>;
    byId: Map<string, LaneModel[]>;
  } {
    const byName = new Map<string, LaneModel[]>();
    const byId = new Map<string, LaneModel[]>();

    lanes.forEach((lane) => {
      const { components } = lane;
      components.forEach((component) => {
        const name = component.fullName;
        const id = component.toString();
        const existingByName = byName.get(name) || [];
        const existingById = byId.get(id) || [];
        existingByName.push(lane);
        existingById.push(lane);
        byName.set(name, existingByName);
        byId.set(id, existingById);
      });
    });
    return { byName, byId };
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
    this.laneIdsByScope = LanesModel.groupByScope(this.lanes.map((lane) => lane.id));
    const { byId, byName } = LanesModel.groupByComponentNameAndId(this.lanes);
    this.lanesByComponentId = byId;
    this.lanesByComponentName = byName;
  }

  readonly laneIdsByScope: Map<string, LaneId[]>;
  readonly lanesByComponentName: Map<string, LaneModel[]>;
  readonly lanesByComponentId: Map<string, LaneModel[]>;

  viewedLane?: LaneModel;
  currentLane?: LaneModel;
  readonly lanes: LaneModel[];

  getLaneComponentUrlByVersion = (componentId: ComponentID, laneId?: LaneId) => {
    // if there is no version, the component is new and is on main
    const defaultLane = this.getDefaultLane();
    if (!componentId.version || !laneId || !defaultLane) return LanesModel.getMainComponentUrl(componentId);
    const lane = this.getLanesByComponentId(componentId)?.find((l) => l.id.isEqual(laneId));
    if (!lane) {
      // return url from main if it exits
      return defaultLane.components.find((c) => c.isEqual(componentId))
        ? LanesModel.getMainComponentUrl(componentId, laneId)
        : undefined;
    }
    if (lane.id.isDefault()) return LanesModel.getMainComponentUrl(componentId);
    return LanesModel.getLaneComponentUrl(componentId, lane.id);
  };

  setViewedLane = (viewedLaneId?: LaneId) => {
    this.viewedLane = viewedLaneId ? this.lanes.find((lane) => lane.id.isEqual(viewedLaneId)) : undefined;
  };

  resolveComponentFromUrl = (idFromUrl: string, laneId?: LaneId) => {
    const comps = ((laneId && this.lanes.find((lane) => lane.id.isEqual(laneId))) || this.viewedLane)?.components || [];
    const includesScope = idFromUrl.includes('.');
    if (includesScope) {
      return comps.find((component) => component.toStringWithoutVersion() === idFromUrl);
    }
    return comps.find((component) => component.fullName === idFromUrl);
  };

  getDefaultLane = () => this.lanes.find((lane) => lane.id.isDefault());
  getNonMainLanes = () => this.lanes.filter((lane) => !lane.id.isDefault());

  isInViewedLane = (componentId: ComponentID, includeVersion?: boolean) => {
    if (includeVersion) {
      return this.viewedLane?.components.some((comp) => includeVersion && comp.isEqual(componentId));
    }
    return this.viewedLane?.components.some(
      (comp) => includeVersion && comp.isEqual(componentId, { ignoreVersion: true })
    );
  };

  getLanesByComponentName = (componentId: ComponentID) => this.lanesByComponentName.get(componentId.fullName);
  getLanesByComponentId = (componentId: ComponentID) => this.lanesByComponentId.get(componentId.toString());

  isComponentOnMain = (componentId: ComponentID, includeVersion?: boolean) => {
    if (includeVersion) {
      return !!this.getLanesByComponentId(componentId)?.some((lane) => lane.id.isDefault());
    }

    return !!this.getLanesByComponentName(componentId)?.some((lane) => lane.id.isDefault());
  };

  isComponentOnMainButNotOnLane = (componentId: ComponentID, includeVersion?: boolean, laneId?: LaneId) => {
    return (
      this.isComponentOnMain(componentId, includeVersion) &&
      !this.isComponentOnNonDefaultLanes(componentId, includeVersion, laneId)
    );
  };
  isComponentOnLaneButNotOnMain = (componentId: ComponentID, includeVersion?: boolean, laneId?: LaneId) => {
    return (
      !this.isComponentOnMain(componentId, includeVersion) &&
      this.isComponentOnNonDefaultLanes(componentId, includeVersion, laneId)
    );
  };
  isComponentOnNonDefaultLanes = (componentId: ComponentID, includeVersion?: boolean, laneId?: LaneId) => {
    if (includeVersion) {
      return !!this.getLanesByComponentId(componentId)?.some(
        (lane) => !lane.id.isDefault() && (!laneId || lane.id.isEqual(laneId))
      );
    }
    return !!this.getLanesByComponentName(componentId)?.some(
      (lane) => !lane.id.isDefault() && (!laneId || lane.id.isEqual(laneId))
    );
  };
}
