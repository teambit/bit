import mapObject from 'map-obj';
import { DocsRootProps } from '@teambit/docs';
import DocsRoot from '@teambit/react.ui.docs-app';
import { htmlToReact } from './html-to-react';

const htmlDocsRoot = function({
  Provider,
  componentId,
  docs,
  compositions,
  ...rest
}: DocsRootProps) {

  // should be mapObject<Record<string, any>, Record<string, () => any>>
  // @ts-ignore TODO fix
  const reactCompositions = mapObject(compositions, (key, value) => [key, htmlToReact(value as HTMLElement)]);

  return DocsRoot({Provider, componentId, docs, compositions: reactCompositions, ...rest});
}

htmlDocsRoot.apiObject = true;

export default htmlDocsRoot;
