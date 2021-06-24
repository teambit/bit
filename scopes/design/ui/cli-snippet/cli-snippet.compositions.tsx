import React, { useEffect, useRef } from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';

import { CliSnippet } from './index';

const content = `this is some cli content\n which should be rendered properly as html`;

export const CliSnippetExample = () => {
  return (
    <ThemeCompositions>
      <CliSnippet content={content} />
    </ThemeCompositions>
  );
};

export const CliSnippetLongExample = () => {
  const log =
    "[webpack-dev-server] Module Warning \n (from ../../.bvm/vers\nions/0.0.425/bit-0.0.425/node_ \n modules/source-map-\nloader/dist/cjs.js)\n:'/home/circl\neci/Library/Caches/Bit/capsu\nles/8891be5ad3d35bfc38b9c\nd90c0e05b598a5a\n55af/teambit.workspace_workspace@0.0.423/works\npace.ui.runtime.js.map' file: Error: ENOENT: no such file or directory, open \n'/home/circleci/Library/Caches/Bit/capsules/8891be5ad3d35bfc3\n8b9cd90c0e05b598a5a55af/teambit.workspace_workspace@0.0.423/w\norkspace.ui.runtime.js.map'Failed to parse source map\n from '/Users/oded/.bvm/versions/0.0.425/bit-0.0.425/node_mod\nules/@teambit/workspace/dist/home/circleci/Library/Caches/Bit/caps\nules/8891be5ad3d35bfc38b9cd90c0e05b598a5a55af/t\neambit.workspace_workspace@0.0.423/work\nspace.ui.runtime.js.map' file: Error: ENOENT: no such file or directory, open \n'/Users/oded/.bvm/versions/0.0.425/bit-0.0.425/node_modules/@te\nambit/workspace/dist/home/circleci/Library/Caches/Bit/capsules/8891be5ad3d35bfc38b9c \n d90c0e05b598a5a55af/teambit.workspace_workspace@0.0.423 \n/workspace.ui.runtime.js.map";
  const snippetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const currentLog = snippetRef?.current;
    if (currentLog) {
      currentLog.scrollIntoView({ block: 'end' });
    }
  }, [log]);
  return (
    <ThemeCompositions>
      <div>
        <CliSnippet style={{ maxHeight: '150px', overflowY: 'auto' }} content={log} />
      </div>
    </ThemeCompositions>
  );
};
