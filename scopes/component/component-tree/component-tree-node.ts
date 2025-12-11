import type { ComponentModel } from '@teambit/component';
import type { ComponentType } from 'react';

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
