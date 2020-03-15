import { ReporterExt } from '../reporter';
import { provideReporter } from './reporter.provider';

export default {
  name: 'Reporter',
  dependencies: [],
  config: {},
  provider: provideReporter
};
