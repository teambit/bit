import { BitError } from '@teambit/bit-error';

export default class InvalidScopeNameFromRemote extends BitError {
  constructor(scopeName: string) {
    super(`cannot find scope '${scopeName}'.
if you are targeting a self-hosted scope, please ensure the scope is configured in your remotes (via "bit remote" command) and that the scope name is correct.
if this is a scope on bit.cloud please add the organization name before the scope (yourOrg.some-scope-name)`);
  }
}
