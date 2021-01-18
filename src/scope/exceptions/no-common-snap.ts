import { BitError } from '@teambit/bit-error';

export class NoCommonSnap extends BitError {
  constructor(id: string) {
    super(`fatal: local and remote of "${id}" could not possibly diverged as they don't have any snap in common.
In other words, traversing the hashes of these components indicating that they are not related.
If this component was exported before, it might happen when locally the objects were missing.
In this case, the suggested solution is to untag the local tags, run "bit import" to fetch all objects and then tag and export.
Another case of this error is when locally this component was created for the first time and the remote has already a component with the same name.
In this case, you might want to remove the local component and import the remote`);
  }
}
