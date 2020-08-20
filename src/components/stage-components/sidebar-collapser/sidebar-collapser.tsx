import React, { ReactNode } from 'react';
import classNames from 'classnames';
import ReactTooltip from 'react-tooltip';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
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
} & React.HTMLAttributes<HTMLDivElement>;

export function Collapser({ isOpen, id, tooltipContent, onClick, ...rest }: CollapserProps) {
  return (
    <div
      {...rest}
      onClick={onClick}
      className={classNames(styles.collapser, { [styles.open]: isOpen })}
      data-tip=""
      data-for={id}
    >
      <div className={styles.circle}>
        <div>
          <Icon of="right-rounded-corners" />
        </div>
      </div>
      <ReactTooltip place="top" id={id} effect="solid">
        {tooltipContent}
      </ReactTooltip>
    </div>
  );
}
