import { ComponentType } from 'react';
import { ComponentModel } from '@teambit/component';

export type ComponentTreeNodeProps = {
  /**
   * component model.
   */
  component: ComponentModel;
};

export type ComponentTreeNode = {
  /**
   * component to render inside the tree node.
   */
  widget: ComponentType<ComponentTreeNodeProps>;
};
