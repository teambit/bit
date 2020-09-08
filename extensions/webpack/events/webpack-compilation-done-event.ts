import { bitBaseEvent } from '../../../custom-types';

export type webpackCompilationDoneEvent = bitBaseEvent & {
  readonly type: 'webpack-compilation-done';
  readonly version: '0.0.0.1';
  readonly timestamp: string;
  readonly body: {
    webpackCompilerVersion: string;
  };
};
