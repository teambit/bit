import { loadScope, Scope } from '../../../scope';
import {
  Action,
  ExportValidate,
  ExportPersist,
  RemovePendingDir,
  FetchMissingDeps,
  ClearScopeCache,
} from '../../../scope/actions';
import ActionNotFound from '../../../scope/exceptions/action-not-found';

type ActionClassesList = new () => Action<any, any>;

export async function action(scopePath: string, name: string, options: Record<string, any>): Promise<any> {
  const scope: Scope = await loadScope(scopePath);
  const actionList: ActionClassesList[] = [
    ExportValidate,
    ExportPersist,
    RemovePendingDir,
    FetchMissingDeps,
    ClearScopeCache,
  ];
  const ActionClass = actionList.find((a) => a.name === name);
  if (!ActionClass) {
    throw new ActionNotFound(name);
  }
  return new ActionClass().execute(scope, options);
}
