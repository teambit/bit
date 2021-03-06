import mapObject from 'map-obj';
import DocsRoot, { ReactDocsRootParams } from '@teambit/react.ui.docs-app';
import { htmlToReact } from './html-to-react';

export default function htmlDocsRoot(...args: ReactDocsRootParams) {
  const [Provider, componentId, docs, compositions, ...rest] = args;

  // should be mapObject<Record<string, any>, Record<string, () => any>>
  // @ts-ignore TODO fix
  const reactCompositions = mapObject(compositions, (key, value) => [key, htmlToReact(value as HTMLElement)]);

  return DocsRoot(Provider, componentId, docs, reactCompositions, ...rest);
}
