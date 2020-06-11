import { providePaper } from './paper.provider';
import { ReporterExt } from '../reporter';

export default {
  name: 'Paper',
  dependencies: [ReporterExt],
  provider: providePaper
};
