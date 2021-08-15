import React, { CSSProperties } from 'react';

// this page is used to render error pages both in browser, and from server endpoints.
// some of these don't support css, so it is inlined here like so.
// perf is ok, since this only applies to a small number of components.

type ErrorPageProps = {
  /**
   * specifies the type of error that was encountered
   */
  code: number;
  /**
   * title to be shown above the error image
   */
  title?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const styles: Record<string, CSSProperties> = {
  errorPage: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 'auto',
    padding: '24px',
    textAlign: 'center',
  },
  title: {
    fontWeight: 'bold',
    margin: '0 0 24px 0',
  },
  img: {
    maxWidth: '700px',
    marginBottom: '24px',
    width: '100%',
  },
};

const inlineStyles = `
.bit-error-page-title { font-size: 36px; }
@media screen and (max-width: 480px) { .bit-error-page-title { font-size: 24px; } }
`;

/**
 * A component that shows an error page according to the error code
 */
export function ErrorPage({ code, title, style, children, ...rest }: ErrorPageProps) {
  return (
    <div {...rest} style={{ ...styles.errorPage, ...style }}>
      <style>{inlineStyles}</style>

      <h1 style={styles.title} className="bit-error-page-title">
        {title}
      </h1>
      <img alt="error-image" style={styles.img} src={`https://static.bit.dev/harmony/${code}.svg`} />
      {children}
    </div>
  );
}
