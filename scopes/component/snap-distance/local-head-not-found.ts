import { BitError } from '@teambit/bit-error';

export class LocalHeadNotFound extends BitError {
  constructor(componentId: string, localHead: string) {
    super(`error: the local head of "${componentId}" is ${localHead}, which is missing from the VersionHistory object and its Version object cannot be loaded locally.
this can happen when a previous import/fetch was interrupted or when the local scope is out of sync.
try running "bit import ${componentId} --objects".`);
  }
}
