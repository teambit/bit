import { ComponentID } from '@teambit/component-id';
import { ComponentIssue, deserializeWithBitId } from './component-issue';

export class MissingComponents extends ComponentIssue {
  description = 'missing components';
  solution = 'use "bit import" or `bit install` to make sure all components exist';
  data: { [filePath: string]: ComponentID[] } = {};
  deserialize(data: string) {
    return deserializeWithBitId(data);
  }
}
