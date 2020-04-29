import { provideReporter } from './reporter.provider';
import { LoggerExt } from '@bit/bit.core.logger';

export default {
  name: 'Reporter',
  dependencies: [LoggerExt],
  config: {},
  provider: provideReporter
};
