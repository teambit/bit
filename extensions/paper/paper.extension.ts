// eslint-disable-next-line import/prefer-default-export
import { providePaper } from './paper.provider';
import { ReporterExt } from '../reporter';

export default {
  name: 'Paper',
  dependencies: [ReporterExt],
  provider: providePaper
};
