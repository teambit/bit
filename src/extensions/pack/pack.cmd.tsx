// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { Command, CLIArgs } from '../cli';
import { Packer } from './pack';
import { Flags, PaperOptions } from '../paper';

export class PackCmd implements Command {
  name = 'pack <componentId> [scopePath]';
  description = 'Create tar for npm publish';
  options = [
    ['d', 'out-dir <out-dir>', 'directory to put the result tar file'],
    ['o', 'override [boolean]', 'override existing pack file'],
    ['k', 'keep [boolean]', 'should keep isolated environment [default = false]'],
    ['p', 'prefix', 'keep custom prefix'],
    ['j', 'json', 'return the output as JSON']
  ] as PaperOptions;
  shortDescription = '';
  alias = '';
  group = '';

  constructor(private packer: Packer) {}

  async render(args: CLIArgs, options: Flags) {
    const packResult = await this.json(args, options);
    return <Color green>tar path: {packResult.data.tarPath}</Color>;
  }

  async json([componentId, scopePath]: CLIArgs, options: Flags) {
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
      options.prefix,
      options.override,
      options.keep
    );
    return {
      data: packResult,
      code: 0
    };
  }
}
