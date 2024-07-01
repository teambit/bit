import { loadScope, Scope } from '@teambit/legacy/dist/scope';
import {
  Action,
  ExportValidate,
  ExportPersist,
  RemovePendingDir,
  FetchMissingDeps,
  PostSign,
  FetchMissingHistory,
} from '@teambit/legacy/dist/scope/actions';
import ActionNotFound from '@teambit/legacy/dist/scope/exceptions/action-not-found';
import { AuthData } from '@teambit/legacy/dist/scope/network/http/http';

type ActionClassesList = new () => Action<any, any>;
type ExternalAction = { name: string; execute: Function };

export class ExternalActions {
  static externalActions: ExternalAction[] = [];
}

export async function action(
  scopePath: string,
  name: string,
  options: Record<string, any>,
  authData?: AuthData
): Promise<any> {
  const externalAction = ExternalActions.externalActions.find((extAction) => extAction.name === name);
  if (externalAction) {
    return externalAction.execute(options);
  }
  const scope: Scope = await loadScope(scopePath);
  const actionList: ActionClassesList[] = [
    ExportValidate,
    ExportPersist,
    RemovePendingDir,
    FetchMissingDeps,
    PostSign,
    FetchMissingHistory,
  ];
  const ActionClass = actionList.find((a) => a.name === name);
  if (!ActionClass) {
    throw new ActionNotFound(name);
  }
  return new ActionClass().execute(scope, options, authData);
}
