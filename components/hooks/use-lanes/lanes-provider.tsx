import React, { ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useLocation, Location } from '@teambit/base-react.navigation.link';
import { LaneId } from '@teambit/lane-id';
import { LanesContext, LanesContextModel } from './lanes-context';
import { useLanes, UseLanesOptions as UseLaneOptions } from './use-lanes';

export type IgnoreDerivingFromUrl = (location?: Location) => boolean;

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: LaneId;
  targetLanes?: LanesModel;
  skipNetworkCall?: boolean;
  ignoreDerivingFromUrl?: IgnoreDerivingFromUrl[];
  options?: UseLaneOptions;
  useScope?: () => { scope?: string };
};

export function LanesProvider({
  children,
  viewedLaneId: viewedIdFromProps,
  targetLanes,
  ignoreDerivingFromUrl: ignoreDerivingFromUrlFromProps,
  skipNetworkCall,
  options: optionsFromProps = {},
  useScope,
}: LanesProviderProps) {
  const [lanesState, setLanesState] = useState<LanesModel | undefined>();
  const [viewedLaneId, setViewedLaneId] = useState<LaneId | undefined>(viewedIdFromProps);
  const { scope } = useScope?.() || {};

  const skip = skipNetworkCall || !!targetLanes;

  const options = useMemo(
    () => ({
      skip,
      ids: optionsFromProps.ids ?? (viewedLaneId ? [viewedLaneId.toString()] : undefined),
      offset: optionsFromProps.offset ?? 0,
      limit: optionsFromProps.limit ?? 10,
      ...optionsFromProps,
    }),
    [skip, optionsFromProps.ids, optionsFromProps.ids?.length, viewedLaneId?.toString()]
  );

  const { lanesModel, loading, hasMore, fetchMoreLanes, offset, limit } = useLanes(
    targetLanes,
    skipNetworkCall,
    options,
    undefined,
    scope
  );

  useEffect(() => {
    if (!loading && lanesModel) setLanesState(lanesModel);
  }, [lanesModel, loading]);

  const updateViewedLane = useCallback(
    (lane?: LaneId) => {
      setViewedLaneId(lane);
      setLanesState((state) => {
        state?.setViewedOrDefaultLane(lane);
        return state;
      });
    },
    [lanesModel]
  );

  const location = useLocation();
  const query = useQuery();

  const ignoreDerivingFromUrl = useCallback((_location?: Location) => {
    if (ignoreDerivingFromUrlFromProps) return ignoreDerivingFromUrlFromProps.some((fn) => fn(_location));
    return false;
  }, []);

  useEffect(() => {
    if (viewedIdFromProps) updateViewedLane(viewedIdFromProps);
  }, [viewedIdFromProps?.toString()]);

  useEffect(() => {
    if (ignoreDerivingFromUrl(location)) return;

    const viewedLaneIdFromUrl =
      (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, query)) || undefined;

    const viewedLaneIdToSet =
      viewedLaneIdFromUrl ||
      viewedLaneId ||
      lanesModel?.currentLane?.id ||
      lanesModel?.lanes.find((lane) => lane.id.isDefault())?.id;

    updateViewedLane(viewedLaneIdToSet);
  }, [location?.pathname]);

  useEffect(() => {
    setLanesState((existing) => {
      if (!loading && lanesModel?.lanes.length) {
        const state = new LanesModel({ ...lanesModel });
        if (viewedLaneId === undefined && lanesModel?.currentLane?.id) {
          state.setViewedOrDefaultLane(lanesModel?.currentLane?.id);
        } else {
          state.setViewedOrDefaultLane(viewedLaneId);
        }
        return state;
      }
      return existing;
    });
  }, [loading, lanesModel?.lanes.length, viewedLaneId]);

  const lanesContextModel: LanesContextModel = {
    lanesModel: lanesState,
    updateViewedLane,
    loading,
    hasMore,
    fetchMoreLanes,
    options,
    offset,
    limit,
  };

  return <LanesContext.Provider value={lanesContextModel}>{children}</LanesContext.Provider>;
}
