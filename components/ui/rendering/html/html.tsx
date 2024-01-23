import React from 'react';
import { CrossIframeDevTools } from './dev-tools';
import { MountPoint, fillMountPoint } from './mount-point';
import { popAssets, StoredAssets } from './stored-assets';
import { SsrStyles, removeSsrStyles } from './ssr-styles';
import { FullHeightStyle } from './full-height-style';

export type Assets = Partial<{
  /** page title */
  title: string;
  /** js files to load */
  js: string[];
  /** css files to load */
  css: string[];
  /** raw css styles */
  style: string[];
  /** raw data to be stored in the dom. Use Html.popAssets to retrieve it from the dom */
  json: Record<string, string>;
}>;

export interface HtmlProps extends React.HtmlHTMLAttributes<HTMLHtmlElement> {
  withDevTools?: boolean;
  fullHeight?: boolean;
  assets?: Assets;
  ssr?: boolean;
}

/** html template for the main UI, when ssr is active */
export function Html({
  assets = {},
  withDevTools = false,
  fullHeight,
  ssr,
  children = <MountPoint />,
  ...rest
}: HtmlProps) {
  return (
    <html lang="en" {...rest}>
      <head>
        <title>{assets.title || 'bit scope'}</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {ssr && <SsrStyles />}
        {fullHeight && <FullHeightStyle />}
        {withDevTools && <CrossIframeDevTools />}

        {assets.style?.map((x, idx) => (
          <style key={idx}>{x}</style>
        ))}
        {assets.css?.map((x, idx) => (
          <link key={idx} href={x} rel="stylesheet" type="text/css" />
        ))}
      </head>
      <body>
        {children}

        {assets.json && <StoredAssets data={assets.json} />}

        {/* load scripts after showing the the whole html  */}
        {assets.js?.map((x, idx) => (
          <script key={idx} src={x} />
        ))}
      </body>
    </html>
  );
}

Html.fillContent = fillMountPoint;
Html.popAssets = popAssets;

export function ssrCleanup() {
  removeSsrStyles();
}
