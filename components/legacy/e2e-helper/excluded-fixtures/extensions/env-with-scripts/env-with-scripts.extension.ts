import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { NodeMain, NodeAspect } from '@teambit/node';
import { Scripts, ScriptsAspect } from '@teambit/scripts';

export class EnvWithScriptsMain {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect, ScriptsAspect];

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const nodeEnvWithScripts = envs.compose(node.nodeEnv, [
      (env) => {
        // Add scripts method to the env using ServiceHandler pattern
        const scriptsObj = Scripts.from({
          'test-script': 'echo hello from script',
          'another-script': 'echo another output',
        });

        // Manually add getScripts since service transforms aren't applied for composed envs
        env.getScripts = () => scriptsObj;

        return env;
      },
    ]);

    envs.registerEnv(nodeEnvWithScripts);
    return new EnvWithScriptsMain(node);
  }
}
