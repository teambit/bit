import { WorkspaceExt } from '../workspace';
import { CompileExt } from '../compile';
import { provideWatch } from './watch.provider';
import { PaperExtension } from '../paper';

export default {
  name: 'Watch',
  dependencies: [PaperExtension, CompileExt, WorkspaceExt],
  provider: provideWatch
};
