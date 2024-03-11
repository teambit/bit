import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { ReactNode } from 'react';
import { Tooltip } from '@teambit/design.ui.tooltip';

import styles from './collapser-button.module.scss';

export type CollapserProps = {
  isOpen: boolean;
  /**
   * content to be placed in the tooltip
   */
  tooltipContent?: ReactNode;
  /**
   * options to place the collapser to the right or left of the element
   */
  placement?: 'right' | 'left';
} & React.HTMLAttributes<HTMLDivElement>;

export function Collapser({
  isOpen,
  tooltipContent,
  placement = 'right',
  onClick,
  className,
  ...rest
}: CollapserProps) {
  const icon = `${placement}-rounded-corners`;
  return (
    <Tooltip content={tooltipContent}>
      <div
        {...rest}
        onClick={onClick}
        className={classNames(styles.collapser, styles[placement], isOpen && styles.open, className)}
      >
        <div className={styles.circle}>
          <div>
            <Icon of={icon} />
          </div>
        </div>
      </div>
    </Tooltip>
  );
}
