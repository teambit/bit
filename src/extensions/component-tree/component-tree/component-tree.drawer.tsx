import React from 'react';
import { Drawer } from '../../sidebar/ui';
import { ComponentTree } from '../../../components/stage-components/side-bar/component-tree';
import { useComponentHost } from '../../component/host';
import { FullLoader } from '../../../to-eject/full-loader';
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
