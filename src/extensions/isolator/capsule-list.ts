import { Capsule } from './capsule';
import { BitId } from '../../bit-id';

export default class CapsuleList extends Array<{ id: BitId; value: Capsule }> {
  getCapsule(id: BitId): Capsule | null {
    const found = this.find(item => item.id.isEqual(id));
    return found ? found.value : null;
  }
  getCapsuleIgnoreVersion(id: BitId): Capsule | null {
    const found = this.find(item => item.id.isEqualWithoutVersion(id));
    return found ? found.value : null;
  }
  getCapsuleIgnoreScopeAndVersion(id: BitId): Capsule | null {
    const found = this.find(item => item.id.isEqualWithoutScopeAndVersion(id));
    return found ? found.value : null;
  }
}
