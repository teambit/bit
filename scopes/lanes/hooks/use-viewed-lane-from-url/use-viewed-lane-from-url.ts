import { useLocation } from '@teambit/base-react.navigation.link';
import { LaneId } from '@teambit/lane-id';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

export function useViewedLaneFromUrl(matchLaneComponentRoute?: boolean): LaneId | undefined {
  const location = useLocation();
  const viewedLaneFromUrl =
    (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, matchLaneComponentRoute)) || undefined;
  return viewedLaneFromUrl;
}
