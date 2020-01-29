import { Harmony, Extension } from '../harmony';
import { Compiler } from './compiler';
import { PaperExt } from '../paper';
import { WorkspaceExt } from '../workspace';

export default Extension.instantiate({
  name: 'Compiler',
  dependencies: [PaperExt, WorkspaceExt],
  config: {
    foo: 'bar'
  },
  provider: Compiler.provide
});
