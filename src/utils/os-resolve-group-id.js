/** @flow */
import { getgrnam } from 'posix';

export default function resolveGroupId(groupName: string): ?number {
  const group = getgrnam(groupName);
  if (group) return group.gid;
  return null;
}
