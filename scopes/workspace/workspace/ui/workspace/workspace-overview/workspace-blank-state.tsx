import React, { useState } from 'react';
import { HopeAiIcon } from '@teambit/hope.design.hope-icon';
import styles from './workspace-blank-state.module.scss';

/**
 * Empty workspace state, shown when the workspace has no components.
 * Replaces the legacy `@teambit/workspace.ui.empty-workspace` for the Hope flow.
 *
 * The primary CTA invites the user to prompt Hope in the chat. The secondary
 * "do it yourself" path uses the Bit CLI in the user's terminal.
 */
export function WorkspaceBlankState() {
  return (
    <div className={styles.container}>
      <div className={styles.vignette} aria-hidden />

      <div className={styles.body}>
        <h1 className={styles.headline}>
          Your workspace is <em>ready</em> for its first component.
        </h1>

        <p className={styles.sub}>Components will appear here as they're built.</p>

        {/* Primary — prompt Hope in the chat */}
        <div className={styles.hopeCallout}>
          <HopeAiIcon size={32} className={styles.hopeIcon} />
          <div className={styles.hopeText}>
            <div className={styles.hopeTitle}>Prompt Hope in the chat</div>
            <div className={styles.hopeHelp}>
              Describe what you want to build, from a single component to a whole design system.
            </div>
          </div>
        </div>

        {/* OR separator */}
        <div className={styles.sep}>
          <div className={styles.sepLine} />
          <span className={styles.sepLabel}>or do it yourself</span>
          <div className={styles.sepLine} />
        </div>

        {/* Secondary — DIY CLI options */}
        <div className={styles.diyGrid}>
          <DiyRow title="Create" body="Scaffold a new component." cmd="bit create react button" />
          <DiyRow title="Import" body="Bring one from another scope." cmd="bit import org.scope/comp" />
        </div>

        <div className={styles.docsLinks}>
          <a href="https://bit.dev/docs" className={styles.link} target="_blank" rel="noopener noreferrer">
            CLI docs ↗
          </a>
          <a href="https://bit.cloud/docs" className={styles.link} target="_blank" rel="noopener noreferrer">
            Cloud docs ↗
          </a>
        </div>
      </div>

      {/* Highlighted CTA — talk to a Bit Cloud expert */}
      <a href="https://bit.cloud/contact-us" className={styles.contactBand} target="_blank" rel="noopener noreferrer">
        <span className={styles.contactText}>
          <span className={styles.contactTitle}>Talk to a Bit Cloud expert</span>
          <span className={styles.contactSub}>
            See how Bit accelerates your team, from first product to production.
          </span>
        </span>
        <span className={styles.contactBtn}>Contact us →</span>
      </a>

      <div className={styles.bottom}>
        <IconLink
          href="https://join.slack.com/t/bit-dev-community/shared_invite/zt-1el4b4sb5-FpgRefqUiZbUH9lvnHgwRg"
          src="https://static.bit.dev/harmony/slack-round-icon.svg"
          label="Bit community on Slack"
        />
        <IconLink
          href="https://github.com/teambit/bit"
          src="https://static.bit.dev/harmony/github.svg"
          label="Bit on GitHub"
        />
      </div>
    </div>
  );
}

function IconLink({ href, src, label }: { href: string; src: string; label: string }) {
  return (
    <a href={href} className={styles.iconLink} target="_blank" rel="noopener noreferrer" aria-label={label}>
      <img src={src} alt={label} className={styles.logo} />
    </a>
  );
}

function DiyRow({ title, body, cmd }: { title: string; body: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className={styles.diyRow}>
      <div>
        <div className={styles.diyTitle}>{title}</div>
        <div className={styles.diyBody}>{body}</div>
      </div>
      <div className={styles.diyCmdRow}>
        <div className={styles.diyCmd}>
          <span className={styles.diyPrompt}>$</span>
          <span className={styles.diyCmdText}>{cmd}</span>
        </div>
        <button type="button" onClick={onCopy} className={styles.diyCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
