import React, { useState } from 'react';
import { BaseIcon } from '@teambit/base-ui.elements.icon';
import type { TreeNode as TreeNodeType } from '../recursive-tree';
import { CollapsingNode } from './collapsing-node';

const node: TreeNodeType<any> = {
  id: '1',
  children: [
    { id: 'Content 1' },
    { id: 'Content 2' },
    { id: 'Content 3', children: [{ id: 'Content 4' }, { id: 'Content 5' }] },
  ],
};

export const BasicCollapsingNode = () => {
  const [isOpen, setOpen] = useState(false);
  const title = <div onClick={() => setOpen(!isOpen)}>My Folder</div>;
  return <CollapsingNode title={title} isOpen={isOpen} node={node} depth={1} />;
};

export const CollapsingNodeWithIcon = () => {
  const [isOpen, setOpen] = useState(false);
  const title = (
    <div onClick={() => setOpen(!isOpen)}>
      <BaseIcon
        of="bitcon-fat-arrow-down"
        style={{
          display: 'inline-block',
          marginRight: 8,
          transition: 'all 300ms',
          transform: !isOpen ? 'rotate(-0.25turn)' : undefined,
        }}
      />
      <span>My Folder</span>
    </div>
  );
  return <CollapsingNode title={title} isOpen={isOpen} node={node} depth={1} />;
};
