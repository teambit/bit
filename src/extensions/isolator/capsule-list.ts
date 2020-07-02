import { Capsule } from './capsule';
import { ComponentID } from '../component';

// @todo: it can be improved by extending only Array<Capsule> and the Capsule should have
// ComponentId member
export default class CapsuleList extends Array<{ id: ComponentID; capsule: Capsule }> {
  getCapsule(id: ComponentID): Capsule | null {
    const found = this.find(item => item.id._legacy.isEqual(id._legacy));
    return found ? found.capsule : null;
  }
  getCapsuleIgnoreVersion(id: ComponentID): Capsule | null {
    const found = this.find(item => item.id._legacy.isEqualWithoutVersion(id._legacy));
    return found ? found.capsule : null;
  }
  getCapsuleIgnoreScopeAndVersion(id: ComponentID): Capsule | null {
    const found = this.find(item => item.id._legacy.isEqualWithoutScopeAndVersion(id._legacy));
    return found ? found.capsule : null;
  }
  getAllCapsuleDirs(): string[] {
    return this.map(capsule => capsule.capsule.wrkDir);
  }
  getIdByPathInCapsule(pathInCapsule: string): ComponentID | null {
    const found = this.find(item => pathInCapsule.startsWith(item.capsule.wrkDir));
    return found ? found.id : null;
  }
  getAllCapsules(): Capsule[] {
    return this.map(c => c.capsule);
  }
}
