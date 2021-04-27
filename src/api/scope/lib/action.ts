import { loadScope, Scope } from '../../../scope';
import {
  Action,
  ExportValidate,
  ExportPersist,
  RemovePendingDir,
  FetchMissingDeps,
  PostSign,
} from '../../../scope/actions';
import ActionNotFound from '../../../scope/exceptions/action-not-found';
import { AuthData } from '../../../scope/network/http/http';

type ActionClassesList = new () => Action<any, any>;

export async function action(
  scopePath: string,
  name: string,
  options: Record<string, any>,
  authData?: AuthData
): Promise<any> {
  const scope: Scope = await loadScope(scopePath);
  const actionList: ActionClassesList[] = [ExportValidate, ExportPersist, RemovePendingDir, FetchMissingDeps, PostSign];
  const ActionClass = actionList.find((a) => a.name === name);
  if (!ActionClass) {
    throw new ActionNotFound(name);
  }
  return new ActionClass().execute(scope, options, authData);
}
