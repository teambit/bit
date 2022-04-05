import React from 'react';
// import { EnterpriseOffering } from '@teambit/evangelist.pages.enterprise-offering';
import { MockedComponentWithMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { ExcludeHighlighter } from '../ignore-highlighter';
import { ChildrenHighlighter } from './children-highlighter';
import { MockTarget } from '../mock-component';

export const ChildrenHighlighterPreview = () => {
  return (
    // highlighter runs in compositions, therefor should not have our font
    <ChildrenHighlighter style={{ padding: 40, minWidth: 200, fontFamily: 'sans-serif' }}>
      <MockedComponentWithMeta>target #1</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <br />
      <MockedComponentWithMeta>target #2</MockedComponentWithMeta>
    </ChildrenHighlighter>
  );
};

export const ChildrenHighlighterWithCustomColors = () => {
  return (
    <ChildrenHighlighter
      style={{ padding: 40, minWidth: 200, color: 'yellow', fontFamily: 'sans-serif' }}
      bgColor="cornflowerblue"
      bgColorHover="blue"
      bgColorActive="DarkSlateBlue"
    >
      <MockedComponentWithMeta>hover here</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <MockedComponentWithMeta>also here</MockedComponentWithMeta>
    </ChildrenHighlighter>
  );
};

export const ChildrenHighlighterInsideIgnore = () => {
  return (
    <ExcludeHighlighter>
      <ChildrenHighlighter style={{ fontFamily: 'sans-serif' }}>
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
      </ChildrenHighlighter>
    </ExcludeHighlighter>
  );
};

export const ChildrenHighlighterWithRule = () => {
  return (
    <ChildrenHighlighter rule="#someSubTree *" style={{ minWidth: 300, fontFamily: 'sans-serif' }}>
      <div>
        element filter: <code>"#someSubTree *"</code>
      </div>
      <br />
      <MockedComponentWithMeta>no highlighter</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <div id="someSubTree">
        <MockedComponentWithMeta>this will be highlighted</MockedComponentWithMeta>
      </div>
    </ChildrenHighlighter>
  );
};

export const ChildrenHighlighterWithComponentRule = () => {
  return (
    <ChildrenHighlighter
      componentRule="teambit.design/ui/icon-button"
      style={{ minWidth: 300, fontFamily: 'sans-serif' }}
    >
      <div>
        component filter: <code>"teambit.design/ui/icon-button"</code>
      </div>
      <br />
      <MockedComponentWithMeta>no highlighter</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <MockTarget>this will be highlighted</MockTarget>
    </ChildrenHighlighter>
  );
};

// export const HighlightingAllElementsInTheEnterprisePage = () => {
//   return (
//     <ChildrenHighlighter>
//       <EnterpriseOffering style={{ height: 300 }} />
//     </ChildrenHighlighter>
//   );
// };
