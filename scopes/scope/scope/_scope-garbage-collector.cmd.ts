import { Command, CommandOptions } from '@teambit/cli';
import { GarbageCollectorOpts } from '@teambit/legacy/dist/scope/scope';
import { ScopeMain } from './scope.main.runtime';

/**
 * private command. the underscore prefix is intended.
 */
export class ScopeGarbageCollectorCmd implements Command {
  name = '_scope-gc';
  description = `delete objects that have no reference from the components/lanes of this scope`;
  extendedDescription = 'the deleted objects are copied into "deleted-objects" directory in the local scope';
  alias = '';
  options = [
    ['v', 'verbose', 'show verbose output'],
    ['d', 'dry-run', 'print the refs that are going to be deleted without actually deleting them'],
    ['f', 'find-comp-id-origin <comp-id>', 'find the origin of a specific component'],
    ['s', 'find-scope-id-origin <scope-id>', 'find the origin of all components of the given scope'],
    ['r', 'restore', 'restore deleted objects (copy objects from "deleted-objects" directory to the scope)'],
    ['', 'restore-overwrite', 'same as --restore but overwrite existing objects'],
  ] as CommandOptions;
  loader = true;
  private = true;
  remoteOp = true;

  constructor(private scope: ScopeMain) {}

  async report(_args, opts: GarbageCollectorOpts): Promise<string> {
    await this.scope.legacyScope.garbageCollect(opts);
    return `completed successfully`;
  }
}
