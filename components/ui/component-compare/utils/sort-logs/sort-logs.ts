import { LegacyComponentLog } from '@teambit/legacy-component-log';

export const sortByDateDsc: (logA?: LegacyComponentLog, logB?: LegacyComponentLog) => 1 | -1 | 0 = (logA, logB) => {
  const { date: dateStrB } = logB || {};
  const { date: dateStrA } = logA || {};

  const dateA = dateStrA ? new Date(parseInt(dateStrA)) : new Date();
  const dateB = dateStrB ? new Date(parseInt(dateStrB)) : new Date();

  if (dateA > dateB) return -1;
  return 1;
};
