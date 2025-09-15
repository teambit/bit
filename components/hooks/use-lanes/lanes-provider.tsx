import type { ReactNode } from 'react';
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import type { Location } from '@teambit/base-react.navigation.link';
import { useLocation } from '@teambit/base-react.navigation.link';
import type { LaneId } from '@teambit/lane-id';
import type { LanesContextModel } from './lanes-context';
import { LanesContext } from './lanes-context';
import type { UseLanesOptions as UseLaneOptions } from './use-lanes';
import { useLanes } from './use-lanes';

export type IgnoreDerivingFromUrl = (location?: Location) => boolean;

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: LaneId;
  targetLanes?: LanesModel;
  skipNetworkCall?: boolean;
  ignoreDerivingFromUrl?: IgnoreDerivingFromUrl[];
  options?: UseLaneOptions;
  useScope?: () => { scope?: string };
  loading?: boolean;
};

export function LanesProvider({
  children,
  viewedLaneId: viewedLaneIdProp,
  targetLanes,
  ignoreDerivingFromUrl: ignoreDerivingFromUrlProp,
  skipNetworkCall,
  options: optionsProp = {},
  useScope,
  loading: loadingFromProps,
}: LanesProviderProps) {
  const { scope } = useScope?.() || {};
  const query = useQuery();
  const location = useLocation();

  const skip = skipNetworkCall || Boolean(targetLanes);

  const ignoreDerivingFromUrl = useCallback(
    (_location?: Location) => {
      if (ignoreDerivingFromUrlProp) {
        return ignoreDerivingFromUrlProp.some((fn) => fn(_location));
      }
      return false;
    },
    [ignoreDerivingFromUrlProp]
  );

  const [viewedLaneId, setViewedLaneId] = useState<LaneId | undefined>(() => {
    if (viewedLaneIdProp) return viewedLaneIdProp;

    if (!ignoreDerivingFromUrl(location)) {
      const laneIdFromUrl = location?.pathname ? LanesModel.getLaneIdFromPathname(location.pathname, query) : undefined;
      if (laneIdFromUrl) return laneIdFromUrl;
    }

    return undefined;
  });

  useEffect(() => {
    if (viewedLaneIdProp) setViewedLaneId(viewedLaneIdProp);
  }, [viewedLaneIdProp?.toString()]);

  useEffect(() => {
    if (ignoreDerivingFromUrl(location)) return;

    const laneIdFromUrl = location?.pathname ? LanesModel.getLaneIdFromPathname(location.pathname, query) : undefined;
    if (laneIdFromUrl && (!viewedLaneId || !viewedLaneId.isEqual(laneIdFromUrl))) {
      setViewedLaneId(laneIdFromUrl);
    }
  }, [location?.pathname, query.toString(), viewedLaneId?.toString(), ignoreDerivingFromUrl]);

  const options = useMemo(
    () => ({
      skip,
      ids: optionsProp.ids ?? (viewedLaneId ? [viewedLaneId.toString()] : undefined),
      offset: optionsProp.offset ?? 0,
      limit: optionsProp.limit ?? 10,
      ...optionsProp,
    }),
    [skip, optionsProp, viewedLaneId?.toString()]
  );

  const {
    lanesModel,
    loading: loadingLanesModel,
    hasMore,
    fetchMoreLanes,
    offset,
    limit,
  } = useLanes(targetLanes, skipNetworkCall, options, undefined, scope);

  const loading = useMemo(() => {
    return loadingFromProps || loadingLanesModel;
  }, [loadingFromProps, loadingLanesModel]);

  const lanesState = useMemo(() => {
    if (lanesModel) {
      const newState = new LanesModel({ ...lanesModel });
      const laneIdToSet =
        viewedLaneId || newState.currentLane?.id || newState.lanes.find((lane) => lane.id.isDefault())?.id;
      newState.setViewedOrDefaultLane(laneIdToSet);
      return newState;
    }
    return undefined;
  }, [
    Boolean(lanesModel),
    lanesModel?.viewedLane?.id.toString(),
    viewedLaneId?.toString(),
    loading,
    lanesModel?.lanes.map((lane) => lane.id.toString()).join(','),
  ]);

  const updateViewedLane = useCallback((lane?: LaneId) => {
    setViewedLaneId(lane);
  }, []);

  const addLanes = useCallback(
    (newLanes: LaneModel[]) => {
      if (lanesModel) {
        lanesModel.addLanes(newLanes);
      }
      return lanesModel;
    },
    [Boolean(lanesModel), lanesModel?.lanes.map((lane) => lane.id.toString()).join(',')]
  );

  const lanesContextModel: LanesContextModel = useMemo(
    () => ({
      lanesModel: lanesState,
      updateViewedLane,
      loading,
      hasMore,
      fetchMoreLanes,
      options,
      offset,
      limit,
      addLanes,
    }),
    [
      Boolean(lanesState),
      lanesState?.viewedLane?.id.toString(),
      lanesState?.lanes.map((lane) => lane.id.toString()).join(','),
      updateViewedLane,
      loading,
      hasMore,
      fetchMoreLanes,
      options,
      offset,
      limit,
      addLanes,
    ]
  );

  return <LanesContext.Provider value={lanesContextModel}>{children}</LanesContext.Provider>;
}
