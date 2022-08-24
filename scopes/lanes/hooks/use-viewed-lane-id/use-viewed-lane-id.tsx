import { useMemo } from 'react';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { useLocation } from '@teambit/base-react.navigation.link';
import { LaneId } from '@teambit/lane-id';

export function useViewedLaneId(): LaneId | undefined {
  const location = useLocation();
  return useMemo(() => location && LanesModel.getLaneIdFromPathname(location.pathname), [location?.pathname]);
}
