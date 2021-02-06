import { dependencies } from '../../../api/consumer/lib/dependencies';
import { DebugDependencies } from '../../../consumer/component/dependencies/dependency-resolver/dependencies-resolver';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Dependencies implements LegacyCommand {
  name = 'dependencies <id>';
  description = 'EXPERIMENTAL. show dependencies of the given component and how their version was determined';
  alias = '';
  opts = [] as CommandOptions;

  action([id]: [string]): Promise<any> {
    return dependencies(id);
  }

  report(results: DebugDependencies): string {
    return JSON.stringify(results, undefined, 4);
  }
}
