import type { Scope } from '@teambit/legacy.scope';

let remoteScope: Scope | undefined;

export function setRemoteScope(scope: Scope | undefined) {
  remoteScope = scope;
}

export function getRemoteScope(): Scope | undefined {
  return remoteScope;
}
