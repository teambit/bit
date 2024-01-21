import React, { useState } from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { DrawerUI } from './drawer';

export const DrawerExample = () => {
  const [isOpen, toggle] = useState(false);
  return (
    <ThemeCompositions>
      <div
        style={{
          height: '100px',
          padding: '20px',
          display: 'flex',
        }}
      >
        <DrawerUI isOpen={isOpen} onToggle={() => toggle(!isOpen)} name="example">
          <div style={{ border: '1px solid #ededed' }}>
            <div style={{ paddingLeft: '20px' }}>item1</div>
            <div style={{ paddingLeft: '20px' }}>item1</div>
            <div style={{ paddingLeft: '20px' }}>item1</div>
          </div>
        </DrawerUI>
      </div>
    </ThemeCompositions>
  );
};

DrawerExample.canvas = {
  height: 200,
};
