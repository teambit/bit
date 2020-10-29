import { ComponentModel } from '@teambit/component';
import { RawNode } from './get-graph.query';

export class NodeModel {
  id: string;
  component: ComponentModel;

  static from(rawNode: RawNode) {
    const node = new NodeModel();
    node.id = rawNode.id;
    // @TODO - component model should not expect all fields to have values
    // @ts-ignore
    node.component = ComponentModel.from(rawNode.component);
    return node;
  }
}
