import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useLocation } from '@teambit/base-react.navigation.link';
import styles from './component-compare-widget.module.scss';

export type MenuWidgetIconProps = {
  href?: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareMenuWidget({ href, className, ...rest }: MenuWidgetIconProps) {
  const location = useLocation();
  const isActive = () => {
    if (location) {
      const tildeIndex = location.pathname.indexOf('~');
      if (location.pathname.substring(tildeIndex) === href) return true;
    }
    return false;
  };
  const image = isActive()
    ? 'https://static.bit.dev/bit-icons/compare-active.svg'
    : 'https://static.bit.dev/bit-icons/compare.svg?v=0.1';

  return (
    <Tooltip placement="bottom" offset={[0, 15]} content={'Compare'}>
      <div {...rest} className={classNames(styles.widgetMenuIcon, className)}>
        <img src={image} />
      </div>
    </Tooltip>
  );
}
