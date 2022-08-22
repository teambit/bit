import { useMemo } from 'react';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { useLocation } from '@teambit/base-react.navigation.link';

export function useViewedLane() {
  const location = useLocation();
  return useMemo(() => location && LanesModel.getLaneIdFromPathname(location.pathname), [location?.pathname]);
}
