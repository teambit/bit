export type { ReactMain, UseWebpackModifiers, UseTypescriptModifiers } from './react.main.runtime';
export type { ReactPreview } from './react.preview.runtime';
export type { ReactAppType } from './apps/web/react.app-type';
export type { ReactEnv } from './react.env';
export type { ReactAppOptions, ReactDeployContext } from './apps/web';
// Re-export it to indicate for people that extends the react env that we are using it
// Commented - make errors in safari - SyntaxError: Invalid regular expression: invalid group specifier name
// export * as styleRegexps from '@teambit/modules.style-regexps';

export { ReactAspect, ReactAspect as default } from './react.aspect';
