import { ExecutionContext } from '@teambit/envs';
import { FormatterServiceOptions } from './formatter.service';

export type FormatterOptions = {};
export interface FormatterContext extends ExecutionContext, FormatterOptions, FormatterServiceOptions {}
// export interface FormatterContext extends ExecutionContext {}
// export type FormatterContext = ExecutionContext;
