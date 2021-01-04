import type { Component, ComponentID } from '@teambit/component';
import { normalize } from 'path';
import { BitId } from '@teambit/legacy-bit-id';
import { Capsule } from './capsule';

export default class CapsuleList extends Array<Capsule> {
  getCapsule(id: ComponentID): Capsule | undefined {
    return this.find((capsule) => capsule.component.id.isEqual(id));
  }
  getCapsuleByLegacyId(id: BitId): Capsule | undefined {
    return this.find((capsule) => capsule.component.id._legacy.isEqual(id));
  }
  getCapsuleIgnoreVersion(id: ComponentID): Capsule | undefined {
    return this.find((capsule) => capsule.component.id._legacy.isEqualWithoutVersion(id._legacy));
  }
  getCapsuleIgnoreScopeAndVersion(id: ComponentID): Capsule | undefined {
    return this.find((capsule) => capsule.component.id._legacy.isEqualWithoutScopeAndVersion(id._legacy));
  }
  getAllCapsuleDirs(): string[] {
    return this.map((capsule) => capsule.path);
  }
  getIdByPathInCapsule(pathInCapsule: string): ComponentID | null {
    const normalizedPathInCapsule = normalize(pathInCapsule);
    const found = this.find((capsule) => normalizedPathInCapsule === normalize(capsule.path));
    return found ? found.component.id : null;
  }
  getAllComponents(): Component[] {
    return this.map((c) => c.component);
  }
  static fromArray(capsules: Capsule[]) {
    return new CapsuleList(...capsules);
  }
}
