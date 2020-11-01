import { ComponentID } from '@teambit/component';

export class CapsuleNotFound extends Error {
  constructor(private id: ComponentID) {
    super(`unable to find capsule for component ${id.toString()}`);
  }
}
