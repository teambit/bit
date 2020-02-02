import { Build } from './build';
import { PaperExt } from '../paper';
import { WorkspaceExt } from '../workspace';
import { CapsuleExt } from '../capsule';

export default {
  name: 'Build',
  dependencies: [PaperExt, WorkspaceExt, CapsuleExt],
  provider: Build.provide
};
