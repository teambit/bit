import { ComponentModel, ComponentModelProps } from '@teambit/component';
import { LaneId } from '@teambit/lane-id';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { pathToRegexp } from 'path-to-regexp';
import { compact, uniqBy } from 'lodash';

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
 * LaneOwner
 */
export type LaneQueryLaneOwner = {
  name: string;
  email: string;
  profileImage?: string;
  username?: string;
  displayName?: string;
};
/**
 * GQL
 *  lanes/list
 *  lanes/current
 * Return type of each Lane in a Scope/Workspace
 */
export type LaneQueryResult = {
  id: { name: string; scope: string };
  isMerged?: boolean;
  displayName?: string;
  laneComponentIds?: Array<ComponentIdObj>;
  readmeComponent?: ComponentModelProps;
  hash: string;
  createdAt?: string;
  createdBy?: LaneQueryLaneOwner;
  updatedAt?: Date;
  updatedBy?: LaneQueryLaneOwner;
  dependents?: Array<ComponentIdObj>;
  deleted?: boolean;
};
/**
 * GQL
 * Return type of the lanes query
 */
export type LanesQueryResult = {
  list?: LaneQueryResult[];
  current?: LaneQueryResult;
  default?: LaneQueryResult;
  viewedLane?: [LaneQueryResult];
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
/**
 * Represents a single Lane in a Workspace/Scope
 */
export type LaneModel = {
  id: LaneId;
  hash: string;
  components: ComponentID[];
  readmeComponent?: ComponentModel;
  displayName?: string;
  createdAt?: Date;
  createdBy?: LaneQueryLaneOwner;
  updatedAt?: Date;
  updatedBy?: LaneQueryLaneOwner;
  dependents?: ComponentID[];
  deleted?: boolean;
};
/**
 * Props to instantiate a LanesModel
 */
export type LanesModelProps = {
  lanes?: LaneModel[];
  viewedLane?: LaneModel;
  currentLane?: LaneModel;
  defaultLane?: LaneModel;
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

  static getLaneUrl = (laneId: LaneId, relative?: boolean, lane?: LaneModel) =>
    `${relative ? '' : '/'}${LanesModel.lanesPrefix}/${laneId.toString()}`;

  static getLaneComponentUrl = (
    componentId: ComponentID,
    laneId: LaneId,
    addScopeMetadataInUrl?: boolean,
    lane?: LaneModel
  ) => {
    const isExternalComponent = componentId.scope !== laneId.scope;
    const laneUrl = LanesModel.getLaneUrl(laneId);
    const queryParams = new URLSearchParams();

    if (componentId.version) {
      queryParams.set('version', componentId.version);
    }

    if (addScopeMetadataInUrl) queryParams.set('scope', componentId.scope);

    const urlPath = isExternalComponent
      ? `${laneUrl}${LanesModel.baseLaneComponentRoute}/${componentId.toStringWithoutVersion()}`
      : `${laneUrl}${LanesModel.baseLaneComponentRoute}/${componentId.fullName}`;

    return `${urlPath}?${queryParams.toString()}`;
  };

  static getMainComponentUrl = (
    componentId: ComponentID,
    laneId?: LaneId,
    addScopeMetadataInUrl?: boolean,
    lane?: LaneModel
  ) => {
    const componentUrl = componentId.fullName;
    const queryParams = new URLSearchParams();

    if (laneId) {
      queryParams.set(LanesModel.laneUrlParamsKey, laneId.toString());
    }

    if (addScopeMetadataInUrl) queryParams.set('scope', componentId.scope);

    return `${componentUrl}?${queryParams.toString()}`;
  };

  static mapToLaneModel(laneData: LaneQueryResult): LaneModel {
    const {
      id,
      laneComponentIds = [],
      readmeComponent,
      hash,
      createdAt,
      displayName,
      updatedAt,
      createdBy: createdByData,
      updatedBy: updatedByData,
      dependents = [],
      deleted,
    } = laneData;

    const componentIds =
      laneComponentIds?.map((laneComponentId) => {
        const componentId = ComponentID.fromObject(laneComponentId);
        return componentId;
      }) || [];

    const readmeComponentModel = readmeComponent && ComponentModel.from({ ...readmeComponent });

    const createdAtDate = (createdAt && new Date(+createdAt)) || undefined;
    const createdBy = createdByData
      ? {
          name: createdByData?.name ?? undefined,
          email: createdByData.email ?? undefined,
          username: createdByData?.username ?? undefined,
          displayName: createdByData?.displayName ?? undefined,
          profileImage: createdByData.profileImage ?? undefined,
        }
      : undefined;

    const updatedAtDate = (updatedAt && new Date(+updatedAt)) || undefined;
    const updatedBy = updatedByData?.name
      ? {
          name: updatedByData?.name ?? undefined,
          username: updatedByData?.username ?? undefined,
          displayName: updatedByData?.displayName ?? undefined,
          email: updatedByData.email ?? undefined,
          profileImage: updatedByData.profileImage ?? undefined,
        }
      : undefined;

    return {
      id: LaneId.from(id.name, id.scope),
      components: componentIds,
      readmeComponent: readmeComponentModel,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
      displayName,
      hash,
      updatedBy,
      createdBy,
      deleted,
      dependents: dependents?.map((dependent) => ComponentID.fromObject(dependent)),
    };
  }

  static groupLaneIdsByScope(laneIds: LaneId[]): Map<string, LaneId[]> {
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

  static groupLanesByScope(lanes: LaneModel[]): Map<string, LaneModel[]> {
    const grouped = new Map<string, LaneModel[]>();
    lanes.forEach((lane) => {
      const { scope } = lane.id;
      if (!grouped.has(scope)) {
        grouped.set(scope, [lane]);
      } else {
        const existing = grouped.get(scope) as LaneModel[];
        grouped.set(scope, [...existing, lane]);
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

  static from({
    data,
    scope,
    viewedLaneId,
  }: {
    data: LanesQuery;
    scope?: string;
    // @deprecated
    host?: string;
    viewedLaneId?: LaneId;
  }): LanesModel {
    const lanes = data?.lanes?.list?.map((lane) => LanesModel.mapToLaneModel(lane)) || [];
    const currentLane = data?.lanes?.current ? LanesModel.mapToLaneModel(data.lanes.current) : undefined;
    const defaultLane = data?.lanes?.default
      ? LanesModel.mapToLaneModel(data.lanes.default)
      : (scope && LanesModel.mapToLaneModel({ id: { name: 'main', scope }, hash: '' })) ||
        lanes.find((lane) => lane.id.isDefault()) ||
        undefined;
    const viewedLane = viewedLaneId
      ? lanes.find((lane) => lane.id.isEqual(viewedLaneId))
      : (data?.lanes?.viewedLane && LanesModel.mapToLaneModel(data.lanes.viewedLane[0])) || currentLane || defaultLane;
    const lanesModel = new LanesModel({ lanes, currentLane, defaultLane, viewedLane });
    return lanesModel;
  }

  constructor({ lanes = [], viewedLane, currentLane, defaultLane }: LanesModelProps) {
    this.viewedLane = viewedLane;
    this.currentLane = currentLane;
    this.defaultLane = defaultLane;
    const allUniqueLanes = compact(
      uniqBy([...lanes, this.defaultLane, this.currentLane, this.viewedLane], (lane) => lane?.id.toString())
    );
    this.lanes = allUniqueLanes;
    this.laneIdsByScope = LanesModel.groupLaneIdsByScope(this.lanes.map((lane) => lane.id));
    const { byId, byName } = LanesModel.groupByComponentNameAndId(this.lanes);
    this.lanesByComponentId = byId;
    this.lanesByComponentName = byName;
  }

  laneIdsByScope: Map<string, LaneId[]>;

  lanesByComponentName: Map<string, LaneModel[]>;

  lanesByComponentId: Map<string, LaneModel[]>;

  viewedLane?: LaneModel;

  currentLane?: LaneModel;

  defaultLane?: LaneModel;

  lanes: LaneModel[];

  getLaneComponentUrlByVersion = (
    componentId: ComponentID,
    laneId?: LaneId,
    addScopeMetadataInUrl?: boolean,
    laneFromParams?: LaneModel
  ) => {
    // if there is no version, the component is new and is on main
    // if the component is on the currently checked out lane then remove version
    const defaultLane = this.getDefaultLane();
    if (
      !componentId.version ||
      !laneId ||
      !defaultLane ||
      (laneId && this.currentLane && laneId.isEqual(this.currentLane.id))
    ) {
      return LanesModel.getMainComponentUrl(componentId, undefined, addScopeMetadataInUrl, laneFromParams);
    }

    const lane = this.getLanesByComponentId(componentId)?.find((l) => l.id.isEqual(laneId));

    if (!lane) {
      // return url from main if it exits
      return defaultLane.components.find((c) => c.isEqual(componentId))
        ? LanesModel.getMainComponentUrl(componentId, laneId, addScopeMetadataInUrl, laneFromParams)
        : undefined;
    }
    if (lane.id.isDefault()) {
      return LanesModel.getMainComponentUrl(componentId, undefined, addScopeMetadataInUrl, laneFromParams);
    }
    return LanesModel.getLaneComponentUrl(componentId, lane.id, addScopeMetadataInUrl, laneFromParams);
  };

  setViewedLane = (viewedLaneId?: LaneId) => {
    this.viewedLane = viewedLaneId ? this.lanes.find((lane) => lane.id.isEqual(viewedLaneId)) : undefined;
  };

  setViewedOrDefaultLane = (viewedLaneId?: LaneId) => {
    this.viewedLane = viewedLaneId ? this.lanes.find((lane) => lane.id.isEqual(viewedLaneId)) : this.getDefaultLane();
  };

  resolveComponentFromUrl = (idFromUrl: string, laneId?: LaneId) => {
    const comps = ((laneId && this.lanes.find((lane) => lane.id.isEqual(laneId))) || this.viewedLane)?.components || [];
    const includesScope = idFromUrl.includes('.');
    if (includesScope) {
      return comps.find((component) => component.toStringWithoutVersion() === idFromUrl);
    }
    return comps.find((component) => component.fullName === idFromUrl);
  };

  getDefaultLane = () => this.defaultLane;

  getNonMainLanes = () => this.lanes.filter((lane) => !lane.id.isDefault());

  isInViewedLane = (componentId: ComponentID, includeVersion?: boolean) => {
    if (includeVersion) {
      return this.viewedLane?.components.some((comp) => includeVersion && comp.isEqual(componentId));
    }
    return this.viewedLane?.components.some(
      (comp) => includeVersion && comp.isEqual(componentId, { ignoreVersion: true })
    );
  };

  isViewingCurrentLane = () => this.currentLane && this.viewedLane && this.currentLane.id.isEqual(this.viewedLane.id);

  isViewingDefaultLane = () => this.viewedLane && this.viewedLane.id.isDefault();

  isViewingNonDefaultLane = () => this.viewedLane && !this.viewedLane.id.isDefault();

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

  isComponentDependent = (componentId: ComponentID, includeVersion?: boolean, laneId?: LaneId) => {
    const lane = laneId ? this.lanes.find((l) => l.id.isEqual(laneId)) : this.viewedLane;
    if (!lane) return false;
    if (includeVersion) {
      return !!lane.dependents?.some((dep) => dep.isEqual(componentId));
    }
    return !!lane.dependents?.some((dep) => dep.isEqual(componentId, { ignoreVersion: true }));
  };

  addLanes(newLanes: LaneModel[] = []) {
    this.lanes = LanesModel.concatLanes(this.lanes, newLanes);
    this.laneIdsByScope = LanesModel.groupLaneIdsByScope(this.lanes.map((lane) => lane.id));
    const { byId, byName } = LanesModel.groupByComponentNameAndId(this.lanes);
    this.lanesByComponentId = byId;
    this.lanesByComponentName = byName;
  }

  static concatLanes(lanes: LaneModel[] = [], newLanes: LaneModel[] = []): LaneModel[] {
    return compact(uniqBy([...lanes, ...newLanes], (lane) => lane?.id.toString()));
  }
}
