import { ComponentID, ComponentModel } from '@teambit/component';
import type { RawNode } from './get-graph.query';

export class NodeModel {
  id: string;
  component?: ComponentModel;
  componentId: ComponentID;

  static from(rawNode: RawNode) {
    const node = new NodeModel();
    node.id = rawNode.id;
    // @TODO - component model should not expect all fields to have values
    // @ts-expect-error
    node.component = rawNode.component ? ComponentModel.from(rawNode.component) : undefined;
    node.componentId = node.component ? node.component.id : ComponentID.fromString(rawNode.id);
    return node;
  }
}
