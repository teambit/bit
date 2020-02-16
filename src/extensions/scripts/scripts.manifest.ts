import { Scripts } from './scripts';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';

export default {
  name: 'scripts',
  dependencies: [BitCliExt, WorkspaceExt],
  provider: Scripts.provide
};
