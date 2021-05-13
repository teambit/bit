import { Component, ComponentID, Snap, State, TagMap } from '@teambit/component';
import { IssuesList } from '@teambit/component-issues';
import { Workspace } from '../workspace';
import { ComponentStatus } from './component-status';

// TODO: refactor this to a composition rather than to use inheritance
export class WorkspaceComponent extends Component {
  constructor(
    /**
     * component ID represented by the `ComponentId` type.
     */
    readonly id: ComponentID,

    /**
     * head version of the component. can be `null` for new components.
     */
    readonly head: Snap | null = null,

    /**
     * state of the component.
     */
    workspaceState: State,

    /**
     * tags of the component.
     */
    readonly tags: TagMap = new TagMap(),

    /**
     * workspace extension.
     */
    readonly workspace: Workspace
  ) {
    super(id, head, workspaceState, tags, workspace);
  }

  async getStatus(): Promise<ComponentStatus> {
    return this.workspace.getComponentStatus(this);
  }

  /**
   * get all issues reported on the component.
   */
  async getIssues(): Promise<IssuesList | null> {
    return this.workspace.getComponentIssues(this);
  }

  static fromComponent(component: Component, workspace: Workspace) {
    return new WorkspaceComponent(component.id, component.head, component.state, component.tags, workspace);
  }
}
