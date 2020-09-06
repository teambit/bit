import React from 'react';
import { ComponentTree } from '@teambit/staged-components.side-bar';
import { FullLoader } from '@teambit/staged-components.full-loader';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { Drawer } from '@teambit/sidebar';
import { useScope } from './ui/use-scope';

export class ComponentsDrawer implements Drawer {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  name = 'COMPONENTS';

  render = () => {
    const { scope } = useScope();
    if (!scope) return <FullLoader />;
    return <ComponentTree components={scope.components} treeNodeSlot={this.treeNodeSlot} />;
  };
}
