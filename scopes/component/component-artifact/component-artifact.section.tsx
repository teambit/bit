import {Section} from '@teambit/component';
import React from 'react';
import {MenuWidgetIcon} from '@teambit/ui-foundation.ui.menu-widget-icon';

export class ComponentArtifactSection implements Section {
  route = {
    path: '~component-artifact',
    // children: <ComponentArtifactPage host={""} />,
  };
  navigationLink = {
    href: '~component-artifact',
    children: <MenuWidgetIcon icon="changelog" tooltipContent="Component Artifact" />, // todo: what's the icon?
    displayName: 'Component Artifact',
  };
  order = 30;
}
