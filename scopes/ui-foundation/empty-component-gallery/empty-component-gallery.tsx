import React from 'react';
import classNames from 'classnames';
import { ExternalLink } from '@teambit/design.ui.external-link';
import { Icon } from '@teambit/evangelist.elements.icon';
import { textSize } from '@teambit/base-ui.text.text-sizes';
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
        <span>Export components to</span>&nbsp;
        <span>{name}</span>
      </div>
      <img src="https://static.bit.dev/harmony/no-components.svg" />
      {children}
      <div className={styles.title}>
        <span>New to Harmony?</span> &nbsp;
        <ExternalLink href="https://harmony-docs.bit.dev/tutorial/install-bit/" className={styles.purpleLink}>
          <span className={styles.text}>Start tutorial</span>
          <Icon of="right_arrow" className={classNames(styles.icon, textSize.xxs)} />
        </ExternalLink>
      </div>
      <div className={styles.bottomText}>We're here to help</div>
      <IconLine />
    </div>
  );
}

function IconLine() {
  return (
    <div className={styles.iconLine}>
      <ExternalLink href="https://join.slack.com/t/bit-dev-community/shared_invite/zt-o2tim18y-UzwOCFdTafmFKEqm2tXE4w">
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
