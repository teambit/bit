import React from 'react';
import { ExternalLink } from '@teambit/design.ui.external-link';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ErrorPage } from '@teambit/design.ui.error-page';
import styles from './server-error-page.module.scss';

type ServerErrorPageProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function ServerErrorPage({ ...rest }: ServerErrorPageProps) {
  return (
    <ErrorPage {...rest} code={500} title="Internal server error">
      <div className={styles.iconLine}>
        <ExternalLink href="https://join.slack.com/t/bit-dev-community/shared_invite/zt-o2tim18y-UzwOCFdTafmFKEqm2tXE4w">
          <img alt="bit-logo" className={styles.logo} src="https://static.bit.dev/harmony/slack-round-icon.svg" />
        </ExternalLink>
        <ExternalLink href="https://github.com/teambit/bit">
          <Icon of="github-logo" className={styles.github} />
        </ExternalLink>
        <ExternalLink href="https://harmony-docs.bit.dev/">
          <img alt="bit-logo" className={styles.logo} src="https://static.bit.dev/bit-logo.svg" />
        </ExternalLink>
      </div>
    </ErrorPage>
  );
}
