import { SnapOptions } from './types';
import { Scope } from '../scope/scope.api';
import { Workspace } from 'workspace';
import { BitId as ComponentId } from 'bit-id';

export default class Snap {
  constructor(
    /**
     * access to the `Workspace` instance
     */
    readonly workspace: Workspace,
    /**
     * access to the `Scope` instance
     */
    readonly scope: Scope
  ) {}

  snap(id?: ComponentId, opts?: SnapOptions) {
    console.log('im snapping a component');
  }
}
