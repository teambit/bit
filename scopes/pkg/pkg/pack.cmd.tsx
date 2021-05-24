// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';

import { Packer, PackOptions } from './packer';

type PackArgs = [string, string];
type PackCmdOptions = {
  outDir?: string;
  override?: boolean;
  prefix?: boolean;
  keep?: boolean;
  // useCapsule?: boolean;
};

export class PackCmd implements Command {
  name = 'pack <componentId> [scopePath]';
  description = 'create tar for npm publish';
  options = [
    ['d', 'out-dir <out-dir>', 'directory to put the result tar file'],
    ['o', 'override [boolean]', 'override existing pack file'],
    ['k', 'keep [boolean]', 'should keep isolated environment [default = false]'],
    ['p', 'prefix [boolean]', 'keep custom (binding) prefix'],
    // ['c', 'use-capsule [boolean]', 'isolate using the capsule and pack on the capsule'],
    ['j', 'json [boolean]', 'return the output as JSON'],
  ] as CommandOptions;
  shortDescription = '';
  alias = '';
  group = 'collaborate';

  constructor(private packer: Packer) {}

  async report(args: PackArgs, options: PackCmdOptions) {
    const packResult = await this.json(args, options);
    const warnings: any = packResult.data?.warnings || [];
    const warningsOutput: any = warnings.map((warning) => chalk.yellow(warning)).join('\n');
    const errors: any = packResult.data?.errors || [];
    const errorsOutput: any = errors.map((error) => chalk.yellow(error)).join('\n');
    const tarPathOutput = packResult.data.metadata?.tarPath
      ? chalk.green(`tar path for component ${packResult.data.id}: ${packResult.data.metadata?.tarPath}`)
      : '';
    return `${warningsOutput}\n${errorsOutput}\n${tarPathOutput}`;
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
      // useCapsule: options.useCapsule,
    };

    const packResult = await this.packer.packComponent(compId, scopePathStr, concreteOpts);
    return {
      data: packResult,
      code: 0,
    };
  }
}
