import { BitId } from '@teambit/legacy-bit-id';
import { ComponentIssue, deserializeWithBitId } from './component-issue';

export class MissingComponents extends ComponentIssue {
  description = 'missing components (use "bit import" or `bit install` to make sure all components exist)';
  data: { [filePath: string]: BitId[] } = {};
  deserialize(data: string) {
    return deserializeWithBitId(data);
  }
}
