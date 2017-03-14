/** @flow */
const isWin = require('os').platform() === 'win32';
const getgrnam = (isWin) ? null : require('posix').getgrnam;

export default function resolveGroupId(groupName: string): ?number {
  if (isWin) return null;
  const group = getgrnam(groupName);
  if (group) return group.gid;
  return null;
}
