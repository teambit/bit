import { BitError } from '@teambit/bit-error';

export class TargetHeadNotFound extends BitError {
  constructor(componentId: string, targetHead: string) {
    super(`error: a remote of "${componentId}" points to ${targetHead}, which is missing from the VersionHistory object for some reason.
running "bit import" should fix the issue.`);
  }
}
