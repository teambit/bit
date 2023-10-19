import { HtmlAspect } from './html.aspect';

export { HtmlEnv } from './html.env';
export type { HtmlMain } from './html.main.runtime';
export type { HtmlComposition, HtmlFunctionComposition } from './interfaces';
// @ts-ignore unclear why it starts failing with "Cannot find module './html.docs.mdx' or its corresponding type declarations"
export { default as Html } from './html.docs.mdx';
export default HtmlAspect;
export { HtmlAspect };
