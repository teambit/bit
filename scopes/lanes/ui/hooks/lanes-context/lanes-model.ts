import { ComponentModel } from '@teambit/component';
import { ScopeModel } from '@teambit/scope.models.scope-model';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
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
 * GQL (lanes/getLanes)
 * Return type of each Lane in a Scope/Workspace
 */
export type LaneQueryResult = {
  name: string;
  remote?: string;
  isMerged: boolean;
  components: LaneComponentQueryResult[];
};
/**
 * GQL (lanes)
 * Return type of the entire /lanes query.
 * Represents All Lanes and Current Lane in Scope/Workspace
 */
export type LanesQueryResult = {
  getLanes?: LaneQueryResult[];
};

export type LanesHost = 'workspace' | 'scope';
// export type LaneComponentModel = { model: ComponentModel; url: string };
/**
 * Represents a single Lane in a Workspace/Scope
 */
export type LaneModel = {
  id: string;
  scope: string;
  name: string;
  isMerged: boolean | null;
  components: ComponentModel[];
};
/**
 * Props to instantiate a LanesModel
 */
export type LanesModelProps = {
  lanes?: LaneModel[];
  currentLane?: LaneModel;
};
/**
 * Represents the entire Lanes State in a Workspace/Scope
 * Provides helper methods to extract and map Lane information
 * Keeps track of all the lanes and the currently selected lane from the UI
 */
export class LanesModel {
  static baseLaneRoute = '/~lane';
  static baseLaneComponentRoute = '/~component';

  static laneRouteUrlRegex = `${LanesModel.baseLaneRoute}/:orgId([\\w-]+)?/:scopeId([\\w-]+)/:laneId([\\w-]+)`;

  static laneComponentIdUrlRegex = '[\\w\\/-]*[\\w-]';
  static laneComponentUrlRegex = `${LanesModel.laneRouteUrlRegex}${LanesModel.baseLaneComponentRoute}/:componentId(${LanesModel.laneComponentIdUrlRegex})`;

  static drawer = {
    id: 'LANES',
    name: 'LANES',
    order: 100,
  };

  static regexp = pathToRegexp(LanesModel.laneRouteUrlRegex);

  static getLaneIdFromPathname: (pathname: string) => string | undefined = (pathname) => {
    const path = pathname.includes(LanesModel.baseLaneComponentRoute)
      ? pathname.split(LanesModel.baseLaneComponentRoute)[0]
      : pathname;
    const matches = LanesModel.regexp.exec(path);
    if (!matches) return undefined;
    const [, orgId, scopeId, laneId] = matches;
    return `${orgId ? orgId.concat('.').concat(scopeId) : scopeId}/${laneId}`;
  };

  static getLaneUrl = (laneId: string) => `${LanesModel.baseLaneRoute}/${laneId.replace('.', '/')}`;

  static getLaneComponentUrl = (componentId: ComponentID, laneId: string) =>
    `${LanesModel.getLaneUrl(laneId)}${LanesModel.baseLaneComponentRoute}/${componentId.fullName}?version=${
      componentId.version
    }`;

  static mapToLaneModel(laneData: LaneQueryResult, currentScope?: ScopeModel): LaneModel {
    const { name, remote, isMerged } = laneData;
    const laneName = name;
    const laneScope = remote?.split('/')[0] || currentScope?.name || '';
    const laneId = remote || `${laneScope ? laneScope.concat('/') : ''}${name}`;

    const components = laneData.components.map((component) => {
      const componentModel = ComponentModel.from({
        id: { ...component.id, version: component.head, scope: component.id.scope || laneScope },
        displayName: component.id.name,
        compositions: [],
        packageName: '',
        description: '',
      });
      return componentModel;
    });

    return {
      id: laneId,
      name: laneName,
      scope: laneScope,
      isMerged,
      components,
    };
  }

  static groupByScope(lanes: LaneModel[]): Map<string, LaneModel[]> {
    const grouped = new Map<string, LaneModel[]>();
    lanes.forEach((lane) => {
      const { scope } = lane;
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

  static from(lanesData: LanesQueryResult, currentScope?: ScopeModel): LaneModel[] {
    const lanesResult = lanesData?.getLanes || [];
    const lanes = lanesResult.map((result) => LanesModel.mapToLaneModel(result, currentScope));
    return lanes;
  }

  constructor({ lanes, currentLane }: LanesModelProps) {
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

  readonly currentLane?: LaneModel;
  readonly lanes: LaneModel[];

  isInCurrentLane = (componentId: ComponentID) =>
    this.currentLane?.components.some((comp) => comp.id.name === componentId.name);

  getLaneComponentUrlByVersion = (version?: string) => {
    if (!version) return '';
    const componentAndLane = this.lanebyComponentHash.get(version);
    if (!componentAndLane) return '';
    return LanesModel.getLaneComponentUrl(componentAndLane.component.id, componentAndLane.lane.id);
  };

  getLanesByComponentId = (componentId: ComponentID) => this.lanesByComponentId.get(componentId.fullName);
}
