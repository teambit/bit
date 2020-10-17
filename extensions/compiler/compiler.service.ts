import { EnvService, Environment } from '@teambit/environments';

export type CompilerDescriptor = {
  id: string;
  icon?: string;
  config: string;
};

export class CompilerService implements EnvService<{}, CompilerDescriptor> {
  name = 'Compile';

  getDescriptor(env: Environment) {
    if (!env.getCompiler) return undefined;
    const compiler = env.getCompiler();

    return {
      id: compiler.id,
      icon: compiler.icon,
      config: compiler.config(),
    };
  }
}
