export interface Watcher {
  /**
   * applies upon component change
   * : TODO should be in the workspace.
   */
  onComponentChange?(): void;
}
