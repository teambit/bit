import { BitId } from '@teambit/legacy-bit-id';
import { ComponentIssue, deserializeWithBitId } from './component-issue';

export class RelativeComponents extends ComponentIssue {
  description = 'components with relative import statements found';
  solution = 'use module paths for imported components';
  data: { [filePath: string]: BitId[] } = {};
  isCacheBlocker = false;
  deserialize(data: string) {
    return deserializeWithBitId(data);
  }
}
