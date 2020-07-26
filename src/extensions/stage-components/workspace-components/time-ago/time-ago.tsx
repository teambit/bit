import React, { useEffect, useMemo, useReducer } from 'react';
import classNames from 'classnames';
import timeAgo from '@bit/bit.bit-dev-utils.time-ago';
import styles from './time-ago.module.scss';

type TimeAgoProps = {
  date: string;
} & React.HTMLAttributes<HTMLSpanElement>;

export function TimeAgo(props: TimeAgoProps) {
  const { date, className, ...rest } = props;

  const [refreshIdx, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const tId = setInterval(() => forceUpdate(), 1000 * 60);
    return () => clearInterval(tId);
  }, []);

  const formatted = useMemo(() => {
    return timeAgo(date);
    // intentional: recalculate value when refreshIdx changes.
    // https://github.com/facebook/react/issues/14920#issuecomment-467195930
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, refreshIdx]);

  return (
    <span {...rest} className={classNames(styles.timeAgo, className)}>
      {formatted}
    </span>
  );
}
