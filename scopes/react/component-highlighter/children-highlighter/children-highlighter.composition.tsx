import React from 'react';
// import { EnterpriseOffering } from '@teambit/evangelist.pages.enterprise-offering';
import { MockedComponentWithMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { IconButton } from '@teambit/design.ui.icon-button';
import { ExcludeHighlighter } from '../ignore-highlighter';
import { ChildrenHighlighter } from './children-highlighter';

export const ChildrenHighlighterPreview = () => {
  return (
    <ChildrenHighlighter style={{ padding: 40, minWidth: 200 }}>
      <MockedComponentWithMeta>hover here</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <IconButton>this will be highlighted with dropdown</IconButton>
    </ChildrenHighlighter>
  );
};

export const ChildrenHighlighterWithCustomColors = () => {
  return (
    <ChildrenHighlighter
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
    </ChildrenHighlighter>
  );
};

export const ChildrenHighlighterInsideIgnore = () => {
  return (
    <ExcludeHighlighter>
      <ChildrenHighlighter>
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
    <ChildrenHighlighter rule="#someSubTree *" style={{ minWidth: 300 }}>
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
    <ChildrenHighlighter componentRule="teambit.design/ui/icon-button" style={{ minWidth: 300 }}>
      <div>
        component filter: <code>"teambit.design/ui/icon-button"</code>
      </div>
      <br />
      <MockedComponentWithMeta>no highlighter</MockedComponentWithMeta>
      <br />
      <br />
      <br />
      <IconButton>this will be highlighted</IconButton>
    </ChildrenHighlighter>
  );
};

// export const HighlightingAllElementsInTheEnterprisePage = () => {
//   return (
//     <MultiHighlighter>
//       <EnterpriseOffering style={{ height: 300 }} />
//     </MultiHighlighter>
//   );
// };
