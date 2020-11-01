import { ComponentModel } from '@teambit/component';

export class ScopePayload {
  get isScope() {
    return true;
  }
}

export type PayloadType = ComponentModel | ScopePayload | undefined;
