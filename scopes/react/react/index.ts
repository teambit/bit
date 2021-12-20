export type { ReactMain, UseWebpackModifiers, UseTypescriptModifiers } from './react.main.runtime';
export type { ReactPreview } from './react.preview.runtime';
export type { ReactEnv } from './react.env';
export type { ReactAppOptions } from './react-app-options';
export type { ReactAppDeployContext } from './react-app-options';
// Re-export it to indicate for people that extends the react env that we are using it
// Commented - make errors in safari - SyntaxError: Invalid regular expression: invalid group specifier name
// export * as styleRegexps from '@teambit/modules.style-regexps';

export { ReactAspect, ReactAspect as default } from './react.aspect';
