import type { ReactNode } from 'react';
import React, { useEffect, useMemo, useReducer } from 'react';
import classNames from 'classnames';
import timeAgo from '@teambit/base-ui.utils.time-ago';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './time-ago.module.scss';

export type TimeAgoProps = {
  /**
   * date.
   */
  date: string | number;
  /**
   * tooltip.
   */
  tooltip?: ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>;

export function TimeAgo({ date, tooltip, className, ...rest }: TimeAgoProps) {
  const [refreshIdx, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const tId = setInterval(() => forceUpdate(), 1000 * 60);
    return () => clearInterval(tId);
  }, []);

  const formatted = useMemo(() => {
    return timeAgo(date);
  }, [date, refreshIdx]);

  const wrapWithTooltip = (element: JSX.Element) => {
    if (tooltip === undefined) return element;

    return (
      <Tooltip
        className={styles.dateTooltip}
        placement={'top'}
        content={<div className={styles.dateTooltipContent}>{tooltip}</div>}
      >
        {element}
      </Tooltip>
    );
  };

  return wrapWithTooltip(
    <span {...rest} className={classNames(className)}>
      {formatted}
    </span>
  );
}
