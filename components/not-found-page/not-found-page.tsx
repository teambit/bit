import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ErrorPage } from '@teambit/pages.error';
import { ExternalLink } from '@teambit/routing.external-link';
import styles from './not-found-page.module.scss';

type NotFoundPageProps = {} & React.HTMLAttributes<HTMLDivElement>;

/**
 * A component that shows a 404 error page
 */
export function NotFoundPage({ ...rest }: NotFoundPageProps) {
  return (
    <ErrorPage {...rest} code={404} title="Page not found">
      <div className={styles.iconLine}>
        <ExternalLink href="https://join.slack.com/t/bit-dev-community/shared_invite/enQtNzM2NzQ3MTQzMTg3LWI2YmFmZjQwMTkxNmFmNTVkYzU2MGI2YjgwMmJlZDdkNWVhOGIzZDFlYjg4MGRmOTM4ODAxNTIxMTMwNWVhMzg">
          <img alt="bit-logo" className={styles.logo} src="https://static.bit.dev/harmony/slack-round-icon.svg" />
        </ExternalLink>
        <ExternalLink href="https://github.com/teambit/bit">
          <Icon of="github-logo" className={styles.github} />
        </ExternalLink>
        <ExternalLink href="https://bit-new-docs.netlify.app/docs/getting-started/introduction">
          <img alt="bit-logo" className={styles.logo} src="https://static.bit.dev/bit-logo.svg" />
        </ExternalLink>
      </div>
    </ErrorPage>
  );
}
