import { ComponentModel } from '@teambit/component';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { LegacyComponentLog } from '@teambit/legacy-component-log';

export type ComponentCompareComponentModel = {
  model: ComponentModel;
  hasLocalChanges?: boolean;
};

export type ComponentCompareModel = {
  base?: ComponentCompareComponentModel;
  compare?: ComponentCompareComponentModel;
  loading?: boolean;
  logsByVersion: Map<string, LegacyComponentLog>;
  changes?: ChangeType[] | null;
  fileCompareDataByName?: Map<string, FileCompareResult> | null;
  fieldCompareResultByName?: Map<string, FieldCompareResult> | null;
};

export type FileCompareResult = {
  fileName: string;
  baseContent: string;
  compareContent: string;
  status?: string;
  diffOutput?: string;
};

export type FieldCompareResult = {
  fieldName: string;
  diffOutput?: string;
};

export type ComponentCompareQueryResponse = {
  id: string;
  code: Array<FileCompareResult>;
  aspects: Array<FieldCompareResult>;
};
