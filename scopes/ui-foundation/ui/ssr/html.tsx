import React, { ReactNode } from 'react';

export type Assets = Partial<{
  title: string;
  js: string[];
  css: string[];
  json: Record<string, string>;
}>;

interface HtmlProps extends React.HtmlHTMLAttributes<HTMLHtmlElement> {
  withDevTools?: boolean;
  assets?: Assets;
}

export function Html({ assets = {}, withDevTools = false, children, ...rest }: HtmlProps) {
  return (
    <html lang="en" {...rest}>
      <head>
        <meta charSet="utf-8" />
        <title>{assets.title || 'bit scope'}</title>
        <style id="before-hydrate-styles">
          .--ssr-hidden {'{'}
          display: none;
          {'}'}
        </style>
        <script>
          {'// Allow to use react dev-tools inside the examples'}
          {withDevTools
            ? 'try { window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__; } catch {}'
            : null}
        </script>

        {assets.css?.map((x, idx) => (
          <link key={idx} href={x} rel="stylesheet" type="text/css" />
        ))}
      </head>
      <body>
        <MountPoint>{children}</MountPoint>

        {assets.json && (
          <div className="state" style={{ display: 'none' }}>
            {Object.entries(assets.json).map(([key, content]) => (
              <script
                key={key}
                data-aspect={key}
                type="application/json"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ))}
          </div>
        )}

        {/* load scripts after showing the the whole html  */}
        {assets.js?.map((x, idx) => (
          <script key={idx} src={x} />
        ))}
      </body>
    </html>
  );
}

export function MountPoint({ children }: { children: ReactNode }) {
  return <div id="root">{children}</div>;
}

const placeholderRegex = /<div id="root"><\/div>/;
Html.fillContent = (htmlTemplate: string, content: string) => {
  const filled = htmlTemplate.replace(placeholderRegex, content);
  return filled;
};
