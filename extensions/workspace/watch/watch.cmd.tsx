/**
 Watching for component changes in workspace ${workspace}.
        Compiling all {num-components} components:
        
        STATUS           COMPONENT ID
        ? {status}      {full-component-id}
        X FAIL           teambit.bit/aspect-loader
        V PASSING        teambit.bit/pkg
        
        V 56 components passed
        X 2 components failed:
          - <comp 1>
          - <comp 2>
        
        Finished. (2 minutes)
        
        Watching for component changes (${timestamp})...
 */
//(${new Date().toISOString()}).\n
// console.log(`Watching for component changes (${process.hrtime()})...`)

import { Command, CommandOptions } from '@teambit/cli';

import { Watcher } from './watcher';
import chalk from 'chalk';
import { formatCompileResults } from './output-formatter';

export class WatchCommand implements Command {

  msgs = {
    onAll: (event, path) => console.log(`Event: "${event}". Path: ${path}`),
    onStart: (workspace) => {},
    onReady: (workspace) => {
      console.log(chalk.yellow(`Watching for component changes in workspace ${workspace.config.name}...\n`))
    },
    onChange: (filePath, buildResults) => {
      console.log(`The file ${filePath} has been changed.\n\n`);
      // console.dir(buildResults[0].results)
      // console.dir(buildResults)
      console.log(formatCompileResults(buildResults, false))
    },
    // onAdd: 'onAdd',
    onAdd: (p) => {
      console.log(`The file ${p} has been added`);
    },
    // onUnlink: 'onUnlink',
    onUnlink: (p) => {
      console.log(`file ${p} has been removed`);
    },
    onError: (err) => {
      console.log(`Watcher error ${err}`);
    }
  }


  name = 'watch';
  description = 'watch a set of components';
  alias = '';
  group = 'env';
  shortDescription = '';
  options = [['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace']] as CommandOptions;

  constructor(
    /**
     * watcher extension.
     */
    private watcher: Watcher
  ) {}

  async report(cliArgs: [], { verbose = false }: { verbose?: boolean }) {
    // console.log(`
    // Watching for component changes in workspace {workspace}.
    // Compiling all {num-components} components:
    
    // STATUS           COMPONENT ID
    // ? {status}      {full-component-id}
    // X FAIL           teambit.bit/aspect-loader
    // V PASSING        teambit.bit/pkg
    
    // V 56 components passed
    // X 2 components failed:
    //   - <comp 1>
    //   - <comp 2>
    
    // Finished. (2 minutes)
    
    // Watching for component changes ({timestamp})...
    // `)
    await this.watcher.watch({ msgs: this.msgs, verbose });
    return 'watcher terminated';
  }
  
}
