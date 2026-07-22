/**
 * Workspace-level ambient module declarations for style and asset imports.
 *
 * These make the root type-check (tsc --noEmit) resolve `*.scss`/`*.css`/`*.mdx`/asset imports
 * across the monorepo's UI components independently of any single env component. They intentionally
 * mirror the declarations the react env ships (scopes/react/react/typescript/{style,asset}.d.ts) so
 * the root type-check no longer relies on that env's source being present in the workspace.
 */

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.module.sass' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.module.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.sass' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.mdx' {
  const component: any;
  export default component;
}

declare module '*.png' {
  const value: any;
  export = value;
}
declare module '*.svg' {
  import type { FunctionComponent, SVGProps } from 'react';

  export const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement> & { title?: string }>;
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const value: any;
  export = value;
}
declare module '*.jpeg' {
  const value: any;
  export = value;
}
declare module '*.gif' {
  const value: any;
  export = value;
}
declare module '*.bmp' {
  const value: any;
  export = value;
}
