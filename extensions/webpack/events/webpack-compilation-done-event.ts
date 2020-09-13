import { BitBaseEvent } from '../../../custom-types';

export type webpackCompilationDoneEvent = BitBaseEvent & {
  readonly type: 'webpack-compilation-done';
  readonly version: '0.0.1';
  readonly timestamp: string;
  readonly body: {
    uiServer: any;
  };
};
