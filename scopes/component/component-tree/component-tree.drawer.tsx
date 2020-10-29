// import { useComponentHost } from '@teambit/component';
// import { Drawer } from '@teambit/sidebar';
// import { FullLoader } from '@teambit/uis.full-loader';
// import { ComponentTree } from '@teambit/uis.side-bar';
// import React from 'react';

// import { ComponentTreeSlot } from './component-tree.ui.runtime';

// export class ComponentTreeDrawer implements Drawer {
//   constructor(private treeNodeSlot: ComponentTreeSlot) {}
//   // TODO - check if this is still used @oded/@uri
//   name = 'COMPONENTS';

//   render = () => {
//     const { host } = useComponentHost();

//     if (!host) return <FullLoader />;
//     return <ComponentTree components={host.components} treeNodeSlot={this.treeNodeSlot} />;
//   };
// }
