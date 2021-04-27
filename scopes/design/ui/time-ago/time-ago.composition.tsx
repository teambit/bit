import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { TimeAgo } from './time-ago';

export const YearsAgoWithTimestamp = () => {
  return (
    <ThemeContext>
      <TimeAgo date={1607550179} />
    </ThemeContext>
  );
};

export const MonthTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeContext>
      <TimeAgo date={new Date(date.setMonth(date.getMonth() - 1)).toString()} />
    </ThemeContext>
  );
};

export const MonthsTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeContext>
      <TimeAgo date={new Date(date.setMonth(date.getMonth() - 10)).toString()} />
    </ThemeContext>
  );
};

export const HourTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeContext>
      <TimeAgo date={new Date(date.setHours(date.getHours() - 1)).toString()} />
    </ThemeContext>
  );
};

export const HoursTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeContext>
      <TimeAgo date={new Date(date.setHours(date.getHours() - 10)).toString()} />
    </ThemeContext>
  );
};

export const CurrentTime = () => {
  return (
    <ThemeContext>
      <TimeAgo date={new Date().toString()} />
    </ThemeContext>
  );
};

export const CurrentTimeWithIsoDate = () => {
  return (
    <ThemeContext>
      <TimeAgo date={new Date().toISOString()} />
    </ThemeContext>
  );
};
