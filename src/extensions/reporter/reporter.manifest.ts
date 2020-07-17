import { provideReporter } from './reporter.provider';
import { LoggerExt } from '../logger';

export default {
  name: 'Reporter',
  dependencies: [LoggerExt],
  config: {},
  provider: provideReporter,
};
