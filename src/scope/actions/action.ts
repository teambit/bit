import type { Scope } from '..';
import { AuthData } from '../network/http/http';

export interface Action<Options = undefined, Result = void> {
  execute(scope: Scope, options?: Options, authData?: AuthData): Promise<Result>;
}
