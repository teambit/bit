import { Capsule } from './capsule';
import { ComponentID } from '../component';

export default class CapsuleList extends Array<Capsule> {
  getCapsule(id: ComponentID): Capsule | undefined {
    return this.find((capsule) => capsule.component.id.isEqual(id));
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
    const found = this.find((capsule) => pathInCapsule.startsWith(capsule.path));
    return found ? found.component.id : null;
  }
  static fromArray(capsules: Capsule[]) {
    return new CapsuleList(...capsules);
  }
}
