import mapObject from 'map-obj';
import { DocsRootProps } from '@teambit/docs';
import DocsRoot from '@teambit/react.ui.docs-app';
import { htmlToReact } from './html-to-react';

const htmlDocsRoot = function ({ compositions, ...rest }: DocsRootProps) {
  // should be mapObject<Record<string, any>, Record<string, () => any>>
  // @ts-ignore TODO fix
  const reactCompositions = mapObject(compositions, (key, value) => [key, htmlToReact(value as HTMLElement)]);

  return DocsRoot({ compositions: reactCompositions, ...rest });
};

// for backwards compatibility while users update their  - can be removed by end of 2022
htmlDocsRoot.apiObject = true;

export default htmlDocsRoot;
