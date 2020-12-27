import React, { ReactNode } from 'react';

export type Assets = Partial<{
  js: string[];
  css: string[];
  json: Record<string, string>;
}>;

interface HtmlProps extends React.HtmlHTMLAttributes<HTMLHtmlElement> {
  title: string;
  withDevTools?: boolean;
  assets?: Assets;
}

export function Html({ title, assets = {}, withDevTools = false, children, ...rest }: HtmlProps) {
  return (
    <html lang="en" {...rest}>
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
        <script>
          {/* // Allow to use react dev-tools inside the examples */}
          {withDevTools
            ? 'window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__;'
            : null}
        </script>

        {assets.css?.map((x, idx) => (
          <link key={idx} href={x} rel="stylesheet" type="text/css" />
        ))}
      </head>
      <body>
        <div>YOU ARE SERVER-SIDED</div>

        <MountPoint>{children}</MountPoint>

        {assets.json &&
          Object.entries(assets.json).map(([key, content]) => (
            <script key={key} id={key} type="application/json" dangerouslySetInnerHTML={{ __html: content }} />
          ))}
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
