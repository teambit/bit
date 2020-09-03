import { ComponentStatus as LegacyComponentStatus } from 'bit-bin/dist/consumer/component-ops/component-status-loader';

export type ModifyInfo = {
  hasModifiedFiles: boolean;
  hasModifiedDependencies: boolean;
};

export class ComponentStatus {
  constructor(
    /**
     * is the component modified.
     */
    readonly modifyInfo: ModifyInfo,

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

  static fromLegacy(status: LegacyComponentStatus, hasModifiedDependencies: boolean) {
    const modify: ModifyInfo = {
      hasModifiedFiles: !!status.modified,
      hasModifiedDependencies,
    };
    return new ComponentStatus(
      modify,
      !!status.newlyCreated,
      !!status.deleted,
      !!status.staged,
      !status.notExist,
      !status.missingFromScope,
      !!status.nested
    );
  }
}
