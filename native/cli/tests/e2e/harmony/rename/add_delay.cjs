const { WorkspaceAspect } = require('@teambit/workspace');
class AddOnlyDelay {
  static dependencies = [WorkspaceAspect];
  static async provider([workspace]) {
    // Deliberately no onComponentLoad registration: cached target hydration must
    // still construct the correct unscoped legacy consumer without that slot.
    workspace.registerOnComponentAdd(async (component) => {
      if (component.id.fullName !== 'renamed-component') return;
      // Actual target-add and source-delete bitmap writes use second-resolution
      // backup IDs. Preserve both full snapshots across the real callback phase.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    return new AddOnlyDelay();
  }
}
module.exports = { default: AddOnlyDelay };
