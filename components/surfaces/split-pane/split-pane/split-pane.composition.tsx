import { FatSplitter } from '@teambit/base-ui.surfaces.split-pane.fat-splitter';
import { Layout } from '@teambit/base-ui.surfaces.split-pane.layout';
import { Pane } from '@teambit/base-ui.surfaces.split-pane.pane';
import React from 'react';

import { SplitPane } from './split-pane';

export function WithFatSplitter() {
  return (
    <SplitPane style={{ border: '1px solid black', height: 50 }} layout={Layout.row}>
      <Pane>first</Pane>
      <FatSplitter />
      <Pane>
        lorem
        <br />
        ipsum
      </Pane>
    </SplitPane>
  );
}

export function Percent() {
  return (
    <SplitPane style={{ height: 100 }} size="38%" layout={Layout.column}>
      <Pane style={{ border: '1px solid black' }}>first</Pane>
      <FatSplitter />
      <Pane style={{ border: '1px solid black' }}>second</Pane>
    </SplitPane>
  );
}

export function NegativeSyntax() {
  return (
    <SplitPane style={{ height: 100 }} size="-40px" layout={Layout.column}>
      <Pane style={{ border: '1px solid black' }}>first</Pane>
      <FatSplitter />
      <Pane style={{ border: '1px solid black' }}>second</Pane>
    </SplitPane>
  );
}
