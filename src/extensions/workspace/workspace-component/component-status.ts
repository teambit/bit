import { ComponentStatus as LegacyComponentStatus } from '../../../consumer/component-ops/component-status-loader';

export class ComponentStatus {
  constructor(
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
     *  the component is not authored and not imported.
     */
    readonly nested?: boolean
  ) {}

  status(): string {
    return 'new';
  }

  static fromLegacy(status: LegacyComponentStatus) {
    return new ComponentStatus(
      !!status.modified,
      !!status.newlyCreated,
      !!status.deleted,
      !!status.staged,
      !status.notExist,
      !status.missingFromScope,
      !!status.nested
    );
  }
}
