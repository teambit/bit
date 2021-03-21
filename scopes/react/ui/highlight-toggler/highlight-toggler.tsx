import React, { HTMLAttributes } from 'react';
import classnames from 'classnames';
import { MenuWidgetIcon } from '@teambit/ui.menu-widget-icon';
import styles from './highlight-toggler.module.scss';

export interface HighlightTogglerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  onChange?: (isActive: boolean) => void;
  active: boolean;
}

export function HighlightToggler({ onChange, active, ...rest }: HighlightTogglerProps) {
  return (
    <MenuWidgetIcon
      {...rest}
      icon="code"
      tooltipContent="Component Highlighter (beta)"
      onClick={() => onChange?.(!active)}
      className={classnames(styles.toggleHighlightButton, active && styles.active)}
    />
  );
}
