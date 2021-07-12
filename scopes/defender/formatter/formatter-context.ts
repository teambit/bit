import { ExecutionContext } from '@teambit/envs';

export type FormatterOptions = {};
export interface FormatterContext extends ExecutionContext, FormatterOptions {}
// export interface FormatterContext extends ExecutionContext {}
// export type FormatterContext = ExecutionContext;
