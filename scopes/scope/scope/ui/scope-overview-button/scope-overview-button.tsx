import React from 'react';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { useViewedLaneId } from '@teambit/lanes.hooks.use-viewed-lane-id';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

export function ScopeOverviewButton() {
  const viewedLaneId = useViewedLaneId();
  const href = viewedLaneId ? LanesModel.getLaneUrl(viewedLaneId) : '/';
  return (
    <MenuLinkItem exact href={href} icon="comps">
      Overview
    </MenuLinkItem>
  );
}
