// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Command, CommandOptions } from '@teambit/cli';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Text } from 'ink';
import React from 'react';

import { Packer, PackOptions } from './packer';

type PackArgs = [string, string];
type PackCmdOptions = {
  outDir?: string;
  override?: boolean;
  prefix?: boolean;
  keep?: boolean;
  useCapsule?: boolean;
};

export class PackCmd implements Command {
  name = 'pack <componentId> [scopePath]';
  description = 'Create tar for npm publish';
  options = [
    ['d', 'out-dir <out-dir>', 'directory to put the result tar file'],
    ['o', 'override [boolean]', 'override existing pack file'],
    ['k', 'keep [boolean]', 'should keep isolated environment [default = false]'],
    ['p', 'prefix [boolean]', 'keep custom (binding) prefix'],
    ['c', 'use-capsule [boolean]', 'isolate using the capsule and pack on the capsule'],
    ['j', 'json [boolean]', 'return the output as JSON'],
  ] as CommandOptions;
  shortDescription = '';
  alias = '';
  group = 'collaborate';

  constructor(private packer: Packer) {}

  async render(args: PackArgs, options: PackOptions) {
    const packResult = await this.json(args, options);
    if (packResult.data?.errors?.length) {
      return <Text color="red">{packResult.data?.errors[0]}</Text>;
    }
    return (
      <Text color="green">
        tar path for component {packResult.data.id}: {packResult.data.metadata?.tarPath}
      </Text>
    );
  }

  async json([componentId, scopePath]: PackArgs, options: PackCmdOptions) {
    const compId = typeof componentId === 'string' ? componentId : componentId[0];
    let scopePathStr: string | undefined;
    if (scopePath) {
      scopePathStr = typeof scopePath !== 'string' ? scopePath[0] : scopePath;
    }

    const concreteOpts: PackOptions = {
      writeOptions: {
        outDir: options.outDir,
        override: options.override,
      },
      prefix: options.prefix,
      keep: options.keep,
      useCapsule: options.useCapsule,
    };

    const packResult = await this.packer.packComponent(compId, scopePathStr, concreteOpts);
    return {
      data: packResult,
      code: 0,
    };
  }
}
