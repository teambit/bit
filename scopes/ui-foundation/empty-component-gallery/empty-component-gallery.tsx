import React from 'react';
import { ExternalLink } from '@teambit/ui.external-link';
import styles from './empty-component-gallery.module.scss';

export type EmptyComponentGalleryProps = {
  name: string;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * page to be shown when workspace/scope has no components
 */
export function EmptyComponentGallery({ name, children }: EmptyComponentGalleryProps) {
  return (
    <div className={styles.emptyComponentGallery}>
      <div className={styles.title}>
        <span>No components in</span>&nbsp;
        <span>{name}</span>
      </div>
      <img src="https://static.bit.dev/harmony/no-components.svg" />
      {children}
      <div className={styles.bottomText}>
        Find more info in the&nbsp;
        <ExternalLink
          href="https://bit-harmony.netlify.app/docs/getting-started/what-is-bit"
          className={styles.purpleLink}
        >
          docs
        </ExternalLink>
        , or reach out for additional support
      </div>
      <IconLine />
    </div>
  );
}

function IconLine() {
  return (
    <div className={styles.iconLine}>
      <ExternalLink href="https://join.slack.com/t/bit-dev-community/shared_invite/enQtNzM2NzQ3MTQzMTg3LWI2YmFmZjQwMTkxNmFmNTVkYzU2MGI2YjgwMmJlZDdkNWVhOGIzZDFlYjg4MGRmOTM4ODAxNTIxMTMwNWVhMzg">
        <img alt="slack-logo" className={styles.logo} src="https://static.bit.dev/harmony/slack-round-icon.svg" />
      </ExternalLink>
      <ExternalLink href="https://github.com/teambit/bit">
        <img alt="github-logo" className={styles.logo} src="https://static.bit.dev/harmony/github.svg" />
      </ExternalLink>
      <ExternalLink href="https://bit.dev/support">
        <img alt="support" className={styles.logo} src="https://static.bit.dev/harmony/support.svg" />
      </ExternalLink>
    </div>
  );
}
