import React from 'react';
import { Drawer } from '@teambit/sidebar';
import { ComponentTree } from '@teambit/staged-components.workspace-sections.version-label';
import { useComponentHost } from '@teambit/component';
import { FullLoader } from '@teambit/staged-components.full-loader';
import { ComponentTreeSlot } from '../component-tree.ui';

export class ComponentTreeDrawer implements Drawer {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}
  // TODO - check if this is still used @oded/@uri
  name = 'COMPONENTS';

  component = () => {
    const { host } = useComponentHost();

    if (!host) return <FullLoader />;
    return <ComponentTree components={host.components} treeNodeSlot={this.treeNodeSlot} />;
  };
}
