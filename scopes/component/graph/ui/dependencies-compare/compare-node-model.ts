import { ComponentModel } from '@teambit/component';
import { NodeModel } from '@teambit/graph';

export type CompareStatus = 'same' | 'modified' | 'new' | 'deleted';

export class CompareNodeModel extends NodeModel {
  id: string;
  component: ComponentModel;
  compareVersion: string;
  status: CompareStatus
}
