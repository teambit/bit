import { ComponentID } from '@teambit/component-id';
import { ComponentIssue, deserializeWithBitId } from './component-issue';

export class RelativeComponents extends ComponentIssue {
  description = 'components with relative import statements found';
  solution = 'use module paths for imported components';
  data: { [filePath: string]: ComponentID[] } = {};
  isCacheBlocker = false;
  deserialize(data: string) {
    return deserializeWithBitId(data);
  }
}
