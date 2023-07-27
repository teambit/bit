import { ComponentModel } from '@teambit/component';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { LegacyComponentLog } from '@teambit/legacy-component-log';

export type ComponentCompareComponentModel = {
  model: ComponentModel;
  descriptor?: ComponentDescriptor;
  hasLocalChanges?: boolean;
};

export type ComponentCompareModel = {
  base?: ComponentCompareComponentModel;
  compare?: ComponentCompareComponentModel;
  loading?: boolean;
  logsByVersion: Map<string, LegacyComponentLog>;
  fileCompareDataByName?: Map<string, FileCompareResult> | null;
  fieldCompareResultByName?: Map<string, FieldCompareResult> | null;
  testsCompareResultByName?: Map<string, FileCompareResult> | null;
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
  tests: Array<FileCompareResult>;
};
