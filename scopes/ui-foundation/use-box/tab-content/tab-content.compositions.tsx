import React from 'react';
import { TabContent } from './tab-content';

export const TabContentExample = () => {
  return (
    <TabContent bottom={<div>bottom</div>}>
      <div>children</div>
    </TabContent>
  );
};
