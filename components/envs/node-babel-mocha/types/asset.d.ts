declare module '*.png' {
  const value: any;
  export = value;
}
declare module '*.svg' {
  import type { FunctionComponent, SVGProps } from 'react';

  export const ReactComponent: FunctionComponent<
    SVGProps<SVGSVGElement> & { title?: string }
  >;
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
declare module '*.otf' {
  const value: any;
  export = value;
}
declare module '*.woff' {
  const value: any;
  export = value;
}
declare module '*.woff2' {
  const value: any;
  export = value;
}
