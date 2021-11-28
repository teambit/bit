import React from 'react';
// import { EnterpriseOffering } from '@teambit/evangelist.pages.enterprise-offering';
import { MockedComponentWithMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { ExcludeHighlighter } from '../ignore-highlighter';
import { MultiHighlighter } from './multi-highlighter';

export const MultiHighlighterPreview = () => {
  return (
    <MultiHighlighter style={{ padding: 40, minWidth: 200 }}>
      <MockedComponentWithMeta>hover here</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <MockedComponentWithMeta>also here</MockedComponentWithMeta>
    </MultiHighlighter>
  );
};

export const MultiHighlighterWithCustomColors = () => {
  return (
    <MultiHighlighter
      style={{ padding: 40, minWidth: 200, color: 'yellow' }}
      bgColor="cornflowerblue"
      bgColorHover="blue"
      bgColorActive="DarkSlateBlue"
    >
      <MockedComponentWithMeta>hover here</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <MockedComponentWithMeta>also here</MockedComponentWithMeta>
    </MultiHighlighter>
  );
};

export const MultiHighlighterInsideIgnore = () => {
  return (
    <ExcludeHighlighter>
      <MultiHighlighter>
        Multi Highlighter should still work when inside <code>{'<ExcludeHighlighter>'}</code>
        <br />
        It should only skip exclusion zones inside of it.
        <br />
        <br />
        <br />
        <MockedComponentWithMeta>hover here</MockedComponentWithMeta>
        <br />
        <br />
        <br />
        <MockedComponentWithMeta>also here</MockedComponentWithMeta>
      </MultiHighlighter>
    </ExcludeHighlighter>
  );
};

export const MultiHighlighterWithRule = () => {
  return (
    <MultiHighlighter rule="#someSubTree *">
      <br />
      <br />
      <br />
      <MockedComponentWithMeta>no highlighter</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <div id="someSubTree">
        <MockedComponentWithMeta>this will be highlighted</MockedComponentWithMeta>
      </div>
    </MultiHighlighter>
  );
};

// export const HighlightingAllElementsInTheEnterprisePage = () => {
//   return (
//     <MultiHighlighter>
//       <EnterpriseOffering style={{ height: 300 }} />
//     </MultiHighlighter>
//   );
// };
