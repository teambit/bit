import { ComponentModel } from '@teambit/component';

export class CompareNodeModel {
  id: string;
  component: ComponentModel;
  compareVersion: string;
  status: "unchanged" | "modified" | "added" | "removed"
}
