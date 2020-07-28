import { ComponentStatus as LegacyComponentStatus } from '../../../consumer/component-ops/component-status-loader';
import { ComponentID } from '../../component';

export class ComponentStatus {
  constructor(
    private id: ComponentID,
    /**
     * is the component modified.
     */
    readonly isModified: boolean,

    /**
     * is the new component new.
     */
    readonly isNew: boolean,

    /**
     * is the component deleted from the workspace.
     */
    readonly isDeleted: boolean,

    /**
     * is the component staged.
     */
    readonly isStaged: boolean,

    /**
     * does the component exists in the workspace.
     */
    readonly isInWorkspace: boolean,

    /**
     * does the component exists in the scope.
     */
    readonly isInScope: boolean,

    /**
     *  the component is not deprecated
     */

    readonly isDeprecated: boolean,
    /**
     *  the component is not authored and not imported.
     */
    readonly nested?: boolean
  ) {}

  /**
   *  the component have internal namespace
   */
  get isInternal(): boolean {
    if (this.id.namespace.startsWith('internal')) return true;
    return false;
  }

  static fromLegacy(id: ComponentID, status: LegacyComponentStatus, deprecated: boolean) {
    return new ComponentStatus(
      id,
      !!status.modified,
      !!status.newlyCreated,
      !!status.deleted,
      !!status.staged,
      !status.notExist,
      !status.missingFromScope,
      !!deprecated,
      !!status.nested
    );
  }
}
