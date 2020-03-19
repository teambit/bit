import React from 'react';
import { Color } from 'ink';
import { Command, CLIArgs } from '../cli';
import { Packer } from './pack';
import { Flags } from '../paper/command';

export class PackCmd implements Command {
  name = 'pack <componentId> [scopePath]';
  description = 'Create tar for npm publish';
  // @ts-ignore
  options: PaperOptions = [
    ['d', 'out-dir <out-dir>', 'directory to put the result tar file'],
    ['o', 'override [boolean]', 'override existing pack file'],
    ['k', 'keep [boolean]', 'should keep isolated environment [default = false]']
  ];
  shortDescription = '';
  alias = '';
  group = '';

  constructor(private packer: Packer) {}

  async render([componentId, scopePath]: CLIArgs, options: Flags) {
    const compId = typeof componentId === 'string' ? componentId : componentId[0];
    let scopePathStr: string | undefined;
    if (scopePath) {
      scopePathStr = typeof scopePath !== 'string' ? scopePath[0] : scopePath;
    }
    // @ts-ignore
    const packResult = await this.packer.packComponent(
      compId,
      scopePathStr,
      // @ts-ignore
      options.outDir,
      options.override,
      options.keep
    );
    return <Color green>tar path: {packResult.tarPath}</Color>;
  }
}
