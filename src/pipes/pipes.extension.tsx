import { Extension } from '../harmony';
import { Workspace, WorkspaceExt } from '../workspace';
import { PaperExt, Paper } from '../paper';
import RunCmd from './run.cmd';
import React from 'react';

type PipesDeps = [Paper];
type Config = {};

export default Extension.instantiate<Config, PipesDeps>({
  name: 'Pipes',
  dependencies: [WorkspaceExt, PaperExt],
  config: {},
  provider: async (_config: Config, [paper]: PipesDeps) => {
    paper.register({
      name:'',
      alias: '',
      description: '',
      opts: [],
      render: async () => {
        return <div>Hi!</div>
      }
    })
  }
});
