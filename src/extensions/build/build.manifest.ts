import { Extension } from '../../harmony';
import { Build } from './build';
import { PaperExt } from '../paper';
import { WorkspaceExt } from '../workspace';

export default Extension.instantiate({
  name: 'Build',
  dependencies: [PaperExt, WorkspaceExt],
  config: {
    task: ''
  },
  provider: Build.provide
});
