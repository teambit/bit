import { ComponentID } from '@teambit/component';
import { normalize } from 'path';

import { Capsule } from './capsule';

// @todo: it can be improved by extending only Array<Capsule> and the Capsule should have
// ComponentId member
export default class CapsuleList extends Array<{ id: ComponentID; capsule: Capsule }> {
  getCapsule(id: ComponentID): Capsule | null {
    const found = this.find((item) => {
      return item.id._legacy.isEqual(id._legacy);
    });
    return found ? found.capsule : null;
  }
  getCapsuleIgnoreVersion(id: ComponentID): Capsule | null {
    const found = this.find((item) => item.id._legacy.isEqualWithoutVersion(id._legacy));
    return found ? found.capsule : null;
  }
  getCapsuleIgnoreScopeAndVersion(id: ComponentID): Capsule | null {
    const found = this.find((item) => item.id._legacy.isEqualWithoutScopeAndVersion(id._legacy));
    return found ? found.capsule : null;
  }
  getAllCapsuleDirs(): string[] {
    return this.map((capsule) => capsule.capsule.wrkDir);
  }
  getIdByPathInCapsule(pathInCapsule: string): ComponentID | null {
    const normalizedPathInCapsule = normalize(pathInCapsule);
    const found = this.find((item) => normalizedPathInCapsule === normalize(item.capsule.path));
    return found ? found.id : null;
  }
  getAllCapsules(): Capsule[] {
    return this.map((c) => c.capsule);
  }
}
