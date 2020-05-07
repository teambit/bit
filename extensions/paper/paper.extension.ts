import { providePaper } from './paper.provider';
import { ReporterExt } from '@bit/bit.core.reporter';

export default {
  name: 'Paper',
  dependencies: [ReporterExt],
  provider: providePaper
};
