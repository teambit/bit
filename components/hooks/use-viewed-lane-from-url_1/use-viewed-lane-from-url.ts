import { useLocation } from '@teambit/base-react.navigation.link';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { LaneId } from '@teambit/lane-id';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

export function useViewedLaneFromUrl(): LaneId | undefined {
  const location = useLocation();
  const query = useQuery();

  const viewedLaneFromUrl =
    (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, query)) || undefined;
  return viewedLaneFromUrl;
}
