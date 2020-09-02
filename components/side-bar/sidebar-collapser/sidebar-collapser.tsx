import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { ReactNode } from 'react';
import ReactTooltip from 'react-tooltip';

import styles from './sidebar-collapser.module.scss';

type CollapserProps = {
  isOpen: boolean;
  /**
   * the id used for the tooltip [optional]
   */
  id?: string;
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
  id,
  tooltipContent,
  placement = 'right',
  onClick,
  className,
  ...rest
}: CollapserProps) {
  const icon = `${placement}-rounded-corners`;
  return (
    <div
      {...rest}
      onClick={onClick}
      className={classNames(styles.collapser, styles[placement], isOpen && styles.open, className)}
      data-tip=""
      data-for={id}
    >
      <div className={styles.circle}>
        <div>
          <Icon of={icon} />
        </div>
      </div>
      <ReactTooltip place="top" id={id} effect="solid">
        {tooltipContent}
      </ReactTooltip>
    </div>
  );
}
