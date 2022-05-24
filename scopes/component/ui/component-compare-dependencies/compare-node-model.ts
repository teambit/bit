import { ComponentModel } from '@teambit/component';

export type CompareStatus = 'unchanged' | 'modified' | 'new' | 'deleted';

export class CompareNodeModel {
  id: string;
  component: ComponentModel;
  compareVersion: string;
  status: CompareStatus
}
