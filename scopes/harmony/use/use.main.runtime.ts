import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Config, ConfigAspect } from '@teambit/config';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { UseAspect } from './use.aspect';
import { UseCmd } from './use.cmd';

export class UseMain {
  static slots = [];
  static dependencies = [ConfigAspect, CLIAspect, ScopeAspect];
  static runtime = MainRuntime;
  static async provider([config, cli, scope]: [Config, CLIMain, ScopeMain]) {
    const useCmd = new UseCmd(scope, config);
    cli.register(useCmd);
    return new UseMain();
  }
}

UseAspect.addRuntime(UseMain);
