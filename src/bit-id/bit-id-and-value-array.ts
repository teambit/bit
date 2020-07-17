import { BitId } from '../bit-id';

export default class BitIdAndValueArray<T> extends Array<{ id: BitId; value: T }> {
  getValue(id: BitId): T | null {
    const found = this.find((item) => item.id.isEqual(id));
    return found ? found.value : null;
  }
  getValueIgnoreVersion(id: BitId): T | null {
    const found = this.find((item) => item.id.isEqualWithoutVersion(id));
    return found ? found.value : null;
  }
  getValueIgnoreScopeAndVersion(id: BitId): T | null {
    const found = this.find((item) => item.id.isEqualWithoutScopeAndVersion(id));
    return found ? found.value : null;
  }
}
