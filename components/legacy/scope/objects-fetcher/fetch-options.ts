/**
 * 'component-delta' is not supported anymore in fetchSchema of 0.0.3 and above.
 */
export type FETCH_TYPE = 'component' | 'lane' | 'object' | 'component-delta';
/**
 * the fetch request a scope sends to a remote. scope-api's `fetch` serves it on the remote side.
 */
export type FETCH_OPTIONS = {
  type: FETCH_TYPE;
  /**
   * @deprecated (since 0.0.900) use includeDependencies
   * since 0.1.53 this is ignored from the remotes.
   * it'll be safe to delete this prop once all remotes are updated to 0.1.53 or above.
   * otherwise, in absence of this prop, the remotes will fetch with deps.
   */
  withoutDependencies?: boolean; // default - true
  includeDependencies?: boolean; // default - false
  includeArtifacts: boolean; // default - false
  allowExternal: boolean; // allow fetching components of other scope from this scope. needed for lanes.
  laneId?: string; // mandatory when fetching "latest" from lane. otherwise, we don't know where to find the latest
  onlyIfBuilt?: boolean; // relevant when fetching with deps. if true, and the component wasn't built successfully, don't fetch it.
  ignoreMissingHead?: boolean; // if asking for id without version and the component has no head, don't throw, just ignore
  /**
   * whether include VersionHistory object to get the snaps graph. it's needed to be able to traverse the snaps without
   * having all Version objects locally. default - false.
   */
  includeVersionHistory?: boolean;
  /**
   * avoid this when importing to a workspace. mainly needed for communication between scopes.
   * it traverses and sends the entire history.
   */
  collectParents?: boolean;
  /**
   * in case dependencies are needed (includeDependencies=true) and a component was tagged with bit version >= 0.0.907, so then
   * the graph is saved inside the Version object, then don't send all dependencies.
   */
  preferDependencyGraph?: boolean;

  /**
   * introduced in fetchSchema 0.0.3
   * this was previously achieved by "component-delta" fetch-type, which is not supported since fetch-schema 0.0.3.
   * normally, when passing ids with versions, the client request that version from the remote.
   * if this option is enabled, it tells the remote that the given version exists already on the client, and if  this
   * version is the head on the remote, then, no need to return anything because the client is up to date already.
   * this is an optimization for the most commonly used case of "bit import", where most components are up-to-date.
   */
  returnNothingIfGivenVersionExists?: boolean;

  /**
   * relevant when type is "lane". in case the remote has the lane-history object, it'll be returned as well.
   */
  includeLaneHistory?: boolean;

  /**
   * relevant when fetching components from a lane. it tells the remote to include the components in the
   * updateDependents array.
   */
  includeUpdateDependents?: boolean;

  fetchSchema: string;
};
