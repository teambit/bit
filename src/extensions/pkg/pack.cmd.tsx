// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { Packer, PackOptions } from './pack';
import { CommandOptions, Command } from '../cli';

type PackArgs = [string, string];

export class PackCmd implements Command {
  name = 'pack <componentId> [scopePath]';
  description = 'Create tar for npm publish';
  options = [
    ['d', 'out-dir <out-dir>', 'directory to put the result tar file'],
    ['o', 'override [boolean]', 'override existing pack file'],
    ['k', 'keep [boolean]', 'should keep isolated environment [default = false]'],
    ['p', 'prefix [boolean]', 'keep custom (binding) prefix'],
    ['c', 'use-capsule [boolean]', 'isolate using the capsule and pack on the capsule'],
    ['j', 'json [boolean]', 'return the output as JSON']
  ] as CommandOptions;
  shortDescription = '';
  alias = '';
  group = 'collaborate';

  constructor(private packer: Packer) {}

  async render(args: PackArgs, options: PackOptions) {
    const packResult = await this.json(args, options);
    return <Color green>tar path: {packResult.data.tarPath}</Color>;
  }

  async json([componentId, scopePath]: PackArgs, options: PackOptions) {
    const compId = typeof componentId === 'string' ? componentId : componentId[0];
    let scopePathStr: string | undefined;
    if (scopePath) {
      scopePathStr = typeof scopePath !== 'string' ? scopePath[0] : scopePath;
    }
    const packResult = await this.packer.packComponent(compId, scopePathStr, options);
    return {
      data: packResult,
      code: 0
    };
  }
}
