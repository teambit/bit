import { Extension } from '../harmony';
import { Workspace, WorkspaceExt } from '../workspace';
import { PaperExt, Paper } from '../paper';
import React from 'react';
import { Pipes } from './pipes';
import { Color } from 'ink';

type PipesDeps = [Workspace, Paper];
type Config = {};

export default Extension.instantiate<Config, PipesDeps>({
  name: 'Pipes',
  dependencies: [WorkspaceExt, PaperExt],
  config: {},
  provider: async (_config: Config, [_, paper]: PipesDeps) => {
    const pipes = new Pipes()
    paper.register({
      name:'run',
      alias: '',
      description: 'some description',
      opts: [
        ['j', 'json', 'hey']
      ],
      render: async () => {
        return <Color green>Hi!</Color>
      }
    })
    return pipes
  }
});
