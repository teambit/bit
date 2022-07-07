import mapObject from 'map-obj';
import DocsRoot, { ReactDocsRoot } from '@teambit/react.ui.docs-app';
import { htmlToReact } from './html-to-react';

const htmlDocsRoot: ReactDocsRoot = function({
  Provider,
  componentId,
  docs,
  compositions,
  ...rest
}
) {

  // should be mapObject<Record<string, any>, Record<string, () => any>>
  // @ts-ignore TODO fix
  const reactCompositions = mapObject(compositions, (key, value) => [key, htmlToReact(value as HTMLElement)]);

  return DocsRoot({Provider, componentId, docs, reactCompositions, ...rest});
}

export default htmlDocsRoot;
