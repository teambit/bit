import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { Section } from '@teambit/component';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class AspectsCompareSection implements TabItem, Section {
  constructor(private compareUI: ComponentCompareUI) {}

  navigationLink = {
    href: 'aspects',
    displayName: 'Aspects',
    children: <MenuWidgetIcon icon="configuration" tooltipContent="Configuration" />,
  };

  props = this.navigationLink;

  route = {
    path: 'aspects/*',
    element: this.compareUI.getAspectsComparePage(),
  };

  order = 60;
  widget = true;
  changeType = ChangeType.ASPECTS;
  id = 'aspects';
}
