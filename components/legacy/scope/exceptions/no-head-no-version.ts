import { BitError } from '@teambit/bit-error';

export class NoHeadNoVersion extends BitError {
  constructor(id: string) {
    super(`the component ${id} has no versions and the head is empty.
this is probably a component from another lane which should not be loaded in this lane (or main).
if this component is on a lane, make sure to ask for it with a version.
if that's not the case, make sure to call "getAllIdsAvailableOnLane" and not "getAllBitIdsFromAllLanes"`);
  }
}
