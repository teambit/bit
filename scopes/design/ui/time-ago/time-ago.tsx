import timeAgo from '@teambit/base-ui.utils.time-ago';
import classNames from 'classnames';
import React, { useEffect, useMemo, useReducer } from 'react';

type TimeAgoProps = {
  date: string | number;
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
    <span {...rest} className={classNames(className)}>
      {formatted}
    </span>
  );
}
