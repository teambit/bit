import React, { ReactNode, useMemo } from 'react';
import { useLocation } from '@teambit/base-react.navigation.link';
import { LanesModel, LanesProvider } from '@teambit/lanes.ui.lanes';

export type ViewedLaneFromUrlProps = {
  children: ReactNode;
};

export function ViewedLaneFromUrl({ children }: ViewedLaneFromUrlProps) {
  const location = useLocation();
  const viewedLaneId = useMemo(
    () => location && LanesModel.getLaneIdFromPathname(location.pathname),
    [location?.pathname]
  );
  return <LanesProvider viewedLaneId={viewedLaneId}>{children}</LanesProvider>;
}
