import { ReactAspect } from './react.aspect';

export type { ReactMain, UseWebpackModifiers } from './react.main.runtime';
export type { ReactPreview } from './react.preview.runtime';
export type { ReactEnv } from './react.env';
// Re-export it to indicate for people that extends the react env that we are using it
// Commented - make errors in safari - SyntaxError: Invalid regular expression: invalid group specifier name
// export * as styleRegexps from '@teambit/modules.style-regexps';

export { ReactAspect };
export default ReactAspect;
