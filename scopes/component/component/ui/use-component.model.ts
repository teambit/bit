import type { ComponentDescriptor } from '@teambit/component-descriptor';
import type { LegacyComponentLog } from '@teambit/legacy-component-log';
import type { ComponentID } from '../';
import type { ComponentError } from './component-error';
import type { ComponentModel } from './component-model';

export type LogFilter = {
  offset?: number;
  limit?: number;
  head?: string;
  sort?: string;
  takeHeadFromComponent?: boolean;
};

export type Filters = {
  log?: LogFilter & { type?: string };
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
  id?: ComponentID;
  componentLogs?: ComponentLogs;
  latest?: string;
  packageName?: string;
  error?: ComponentError;
  loading?: boolean;
};

export type ComponentLogs = {
  logs?: LegacyComponentLog[];
  loading?: boolean;
};

export type UseComponentType = (id: string, host: string, filters?: Filters, skip?: boolean) => ComponentQueryResult;
