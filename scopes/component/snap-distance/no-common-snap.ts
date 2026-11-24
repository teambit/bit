import { BitError } from '@teambit/bit-error';

export class NoCommonSnap extends BitError {
  constructor(id: string) {
    super(`fatal: local and remote of "${id}" don't have any snap in common, which means, they're not related.
If this component was exported before, it might happen when the objects were missing locally.
In this case, the suggested solution is to reset the local tags, run "bit import" to fetch all objects and then tag and export.
Another case of this error is when locally this component was created for the first time and the remote already has a component with the same name.
In this case, you might want to remove the local component and import the remote.
Another case of this error is when a lane has a component and the remote of that component has also a component with the same name. to fix this, use "--resolve-unrelated" flag for "bit lane merge" command`);
  }
}
