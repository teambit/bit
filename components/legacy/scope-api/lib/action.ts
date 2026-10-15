import type { Scope } from '@teambit/legacy.scope';
import { ActionNotFound, loadScope } from '@teambit/legacy.scope';
import type { Action } from '@teambit/scope.remote-actions';
import {
  ExportValidate,
  ExportPersist,
  RemovePendingDir,
  PendingDirStatus,
  FetchMissingDeps,
  PostSign,
  FetchMissingHistory,
  FetchVersionHistory,
} from '@teambit/scope.remote-actions';
import type { AuthData } from '@teambit/scope.network';

type ActionClassesList = new () => Action<any, any>;
type ExternalAction = { name: string; execute: Function };

export class ExternalActions {
  static externalActions: ExternalAction[] = [];

  /**
   * an action registered again under the same name replaces the previous one. each harmony load registers its
   * actions, and a process that loads harmony more than once must run the actions of the latest load.
   */
  static register(externalAction: ExternalAction) {
    const index = this.externalActions.findIndex((existing) => existing.name === externalAction.name);
    if (index === -1) this.externalActions.push(externalAction);
    else this.externalActions[index] = externalAction;
  }
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
    PendingDirStatus,
    FetchMissingDeps,
    PostSign,
    FetchMissingHistory,
    FetchVersionHistory,
  ];
  const ActionClass = actionList.find((a) => a.name === name);
  if (!ActionClass) {
    throw new ActionNotFound(name);
  }
  return new ActionClass().execute(scope, options, authData);
}
