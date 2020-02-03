import { PathOsBasedAbsolute } from '../utils/path';
import { BitId } from '../bit-id';

export default class CapsulePaths extends Array<{ id: BitId; path: PathOsBasedAbsolute }> {
  getPath(id: BitId): PathOsBasedAbsolute | null {
    const found = this.find(item => item.id.isEqual(id));
    return found ? found.path : null;
  }
  getPathIgnoreVersion(id: BitId): PathOsBasedAbsolute | null {
    const found = this.find(item => item.id.isEqualWithoutVersion(id));
    return found ? found.path : null;
  }
  getPathIgnoreScopeAndVersion(id: BitId): PathOsBasedAbsolute | null {
    const found = this.find(item => item.id.isEqualWithoutScopeAndVersion(id));
    return found ? found.path : null;
  }
}
