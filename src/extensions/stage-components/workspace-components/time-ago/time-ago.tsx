import React, { useEffect, useMemo, useReducer } from 'react';
import classNames from 'classnames';
import timeAgo from '@bit/bit.bit-dev-utils.time-ago';
import styles from './time-ago.module.scss';

type TimeAgoProps = {
  date: string;
} & React.HTMLAttributes<HTMLSpanElement>;

export function TimeAgo(props: TimeAgoProps) {
  const { date, className, ...rest } = props;

  const [refreshIdx, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const tId = setInterval(() => forceUpdate(), 1000 * 60);
    return () => clearInterval(tId);
  }, []);

  const formatted = useMemo(() => {
    return timeAgo(date);
  }, [date, refreshIdx]);

  return (
    <span {...rest} className={classNames(styles.timeAgo, className)}>
      {formatted}
    </span>
  );
}
