import { htmlToReact } from './html-to-react';
import mapObject from 'map-obj'
// maybe extract React/docs to its own component?
// @ts-ignore TODO - fix
import DocsRoot from '@teambit/react/dist/docs/index.js';

export default function htmlDocsRoot (...args: ReactDocsRootParams) {
	// const reactDocsTemplate = this.options.reactDocsTemplate;
	const [Provider, componentId, docs, compositions, ...rest] = args;
	
	const reactCompositions = mapObject(compositions, (key, value) => [htmlToReact(value), key]);

	return DocsRoot(Provider, componentId, docs, reactCompositions, ...rest);
  }
  
//   TODO - could use Parameters<DocsRoot>
  type ReactDocsRootParams = [
	/* Provider: */ React.ComponentType | undefined,
	/* componentId: */ string,
	// @ts-ignore TODO - import DocsFile type
	/* docs: */ DocsFile | undefined, 
	/* compositions: */ Record<string, any>,
	/* context: */ RenderingContext
  ]
  
//   type ReactDocsRootType = (...args: ReactDocsRootParams) => void;