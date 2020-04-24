import { BitId } from 'bit-bin/bit-id';
import { Capsule } from './capsule';

export default class CapsuleList extends Array<{ id: BitId; value: Capsule }> {
  getValue(id: BitId): Capsule | null {
    const found = this.find(item => item.id.isEqual(id));
    return found ? found.value : null;
  }
  getValueIgnoreVersion(id: BitId): Capsule | null {
    const found = this.find(item => item.id.isEqualWithoutVersion(id));
    return found ? found.value : null;
  }
  getValueIgnoreScopeAndVersion(id: BitId): Capsule | null {
    const found = this.find(item => item.id.isEqualWithoutScopeAndVersion(id));
    return found ? found.value : null;
  }
}
