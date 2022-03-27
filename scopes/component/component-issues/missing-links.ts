import { BitId } from '@teambit/legacy-bit-id';
import { ComponentIssue, deserializeWithBitId } from './component-issue';

export class MissingLinks extends ComponentIssue {
  description = 'missing links between components';
  solution = 'use "bit link" to build missing component links';
  data: { [filePath: string]: BitId[] } = {};
  isLegacyIssue = true;
  deserialize(data: string) {
    return deserializeWithBitId(data);
  }
}
