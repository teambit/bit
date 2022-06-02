import { ComponentModel } from '@teambit/component';
import { NodeModel } from '@teambit/graph';

export type CompareStatus = 'modified' | 'new' | 'deleted' | undefined;

export class CompareNodeModel extends NodeModel {
  id: string;
  component: ComponentModel;
  compareVersion: string;
  status: CompareStatus
}
