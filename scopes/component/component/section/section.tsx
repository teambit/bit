import type { LinkProps } from '@teambit/base-react.navigation.link';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { RouteProps } from 'react-router-dom';

export interface Section {
  route: RouteProps;
  navigationLink: LinkProps;
  /**
   * text to be used in the mobile res dropdown
   */
  displayName?: string;
  order?: number;
  changeType?: ChangeType;
}
