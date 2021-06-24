import { HtmlAspect } from './html.aspect';

export type { HtmlEnv } from './html.env';
export type { HtmlMain } from './html.main.runtime';
export type { HtmlComposition, HtmlFunctionComposition } from './interfaces';
export { renderTemplate, fetchHtmlFromUrl, createElementFromString } from './utils'
export default HtmlAspect;
export { HtmlAspect };
