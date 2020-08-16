import React from 'react';
import { Drawer } from '../../sidebar/ui';
import { ComponentTree } from '../../../components/stage-components/side-bar/component-tree';
import { useComponentHost } from '../host/use-component-host';
import { FullLoader } from '../../../to-eject/full-loader';
import { ComponentTreeSlot } from '../../component-tree/component-tree.ui';

export class ComponentTreeDrawer implements Drawer {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}
  name = 'COMPONENTS';

  component = () => {
    const { host } = useComponentHost();
    if (!host) return <FullLoader />;
    // TODO - remove hard coded filter
    const components = host.components.filter((x) => x.id.legacyComponentId.scope === 'teambit2.documenter-temp');
    return <ComponentTree components={components} treeNodeSlot={this.treeNodeSlot} />;
  };
}
