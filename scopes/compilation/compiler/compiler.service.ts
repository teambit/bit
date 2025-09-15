import type {
  EnvService,
  EnvDefinition,
  Env,
  EnvContext,
  ServiceTransformationMap,
  ExecutionContext,
} from '@teambit/envs';
import chalk from 'chalk';
import highlight from 'cli-highlight';
import type { Compiler } from './types';

export type CompilerDescriptor = {
  id: string;
  icon?: string;
  config?: string;
};

type CompilerTransformationMap = ServiceTransformationMap & {
  getCompiler: () => Compiler;
};

export class CompilerService implements EnvService<{}, CompilerDescriptor> {
  name = 'Compile';

  getCompiler(context: ExecutionContext): Compiler | undefined {
    const compiler = context.env.getCompiler?.();
    return compiler;
  }

  render(env: EnvDefinition) {
    const descriptor = this.getDescriptor(env);
    const name = `${chalk.green('configured compiler:')} ${descriptor?.id} (${descriptor?.displayName} @ ${
      descriptor?.version
    })`;
    const configLabel = chalk.green('compiler config:');
    const configObj = descriptor?.config
      ? highlight(descriptor?.config, { language: 'json', ignoreIllegals: true })
      : '';
    return `${name}\n${configLabel}\n${configObj}`;
  }

  transform(env: Env, context: EnvContext): CompilerTransformationMap | undefined {
    // Old env
    if (!env?.compiler) return undefined;
    return {
      getCompiler: () => env.compiler()(context),
    };
  }

  getDescriptor(env: EnvDefinition) {
    if (!env.env.getCompiler) return undefined;
    const compiler = env.env.getCompiler();

    return {
      id: compiler.id,
      icon: compiler.icon,
      config: compiler.displayConfig ? compiler.displayConfig() : undefined,
      version: compiler.version ? compiler.version() : '?',
      displayName: compiler.displayName ? compiler.displayName : '?',
    };
  }
}
