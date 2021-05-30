import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { TimeAgo } from './time-ago';

export const YearsAgoWithTimestamp = () => {
  return (
    <ThemeCompositions>
      <TimeAgo date={1607550179} />
    </ThemeCompositions>
  );
};

export const MonthTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeCompositions>
      <TimeAgo date={new Date(date.setMonth(date.getMonth() - 1)).toString()} />
    </ThemeCompositions>
  );
};

export const MonthsTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeCompositions>
      <TimeAgo date={new Date(date.setMonth(date.getMonth() - 10)).toString()} />
    </ThemeCompositions>
  );
};

export const HourTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeCompositions>
      <TimeAgo date={new Date(date.setHours(date.getHours() - 1)).toString()} />
    </ThemeCompositions>
  );
};

export const HoursTimeAgo = () => {
  const date = new Date();
  return (
    <ThemeCompositions>
      <TimeAgo date={new Date(date.setHours(date.getHours() - 10)).toString()} />
    </ThemeCompositions>
  );
};

export const CurrentTime = () => {
  return (
    <ThemeCompositions>
      <TimeAgo date={new Date().toString()} />
    </ThemeCompositions>
  );
};

export const CurrentTimeWithIsoDate = () => {
  return (
    <ThemeCompositions>
      <TimeAgo date={new Date().toISOString()} />
    </ThemeCompositions>
  );
};
