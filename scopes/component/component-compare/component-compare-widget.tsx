import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './component-compare-widget.module.scss';

export type MenuWidgetIconProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareMenuWidget({ className, ...rest }: MenuWidgetIconProps) {
  return (
    <Tooltip placement="bottom" offset={[0, 15]} content={'Compare'}>
      <div {...rest} className={classNames(styles.widgetMenuIcon, className)}>
        <img src={'https://static.bit.dev/bit-icons/compare.svg?v=0.1'} />
      </div>
    </Tooltip>
  );
}
