import { useLocation } from '@teambit/base-react.navigation.link';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

export function useViewedLaneFromUrl(matchLaneComponentRoute?: boolean) {
  const location = useLocation();
  const viewedLaneFromUrl =
    (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, matchLaneComponentRoute)) || undefined;
  return viewedLaneFromUrl;
}
