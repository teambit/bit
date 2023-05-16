import { ComponentDescriptor } from '@teambit/component-descriptor';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { ComponentError } from '../component-error';
import { ComponentModel } from '../component-model';

export type LogFilter = {
  logOffset?: number;
  logLimit?: number;
  logHead?: string;
  logStartFrom?: string;
  logUntil?: string;
  logSort?: string;
  takeHeadFromComponent?: boolean;
};

export type Filters = {
  log?: LogFilter & { logType?: string };
  tagLog?: LogFilter;
  snapLog?: LogFilter;
  fetchLogsByTypeSeparately?: boolean;
  loading?: boolean;
};

export type UseComponentOptions = {
  version?: string;
  logFilters?: Filters;
  customUseComponent?: UseComponentType;
  skip?: boolean;
};

export type ComponentQueryResult = {
  component?: ComponentModel;
  componentDescriptor?: ComponentDescriptor;
  componentLogs?: ComponentLogs;
  loading?: boolean;
  error?: ComponentError;
};

export type ComponentLogsResult = {
  componentDescriptor?: ComponentDescriptor;
  componentLogs?: ComponentLogs;
  error?: ComponentError;
  loading?: boolean;
};

export type ComponentLogs = {
  snaps?: LegacyComponentLog[];
  tags?: LegacyComponentLog[];
  logs?: LegacyComponentLog[];
  loading?: boolean;
  hasMoreLogs?: boolean;
  hasMoreSnaps?: boolean;
  hasMoreTags?: boolean;
  loadMoreLogs?: (backwards?: boolean) => Promise<void>;
  loadMoreTags?: (backwards?: boolean) => Promise<void>;
  loadMoreSnaps?: (backwards?: boolean) => Promise<void>;
};

export type UseComponentType = (id: string, host: string, filters?: Filters, skip?: boolean) => ComponentQueryResult;
