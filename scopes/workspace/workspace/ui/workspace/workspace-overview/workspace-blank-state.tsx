import React, { useState } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { HopeAiIcon } from './hope-ai-icon';
import styles from './workspace-blank-state.module.scss';

const DISCORD_URL = 'https://discord.bit.cloud/';

/**
 * Empty workspace state, shown when the workspace has no components.
 * Replaces the legacy `@teambit/workspace.ui.empty-workspace` for the Hope flow.
 *
 * The default state guides the user through the Bit CLI in their terminal. In
 * minimal mode (the embedded Hope experience) we additionally surface the
 * "prompt Hope in the chat" CTA.
 */
export function WorkspaceBlankState() {
  const { isMinimal } = useWorkspaceMode();

  return (
    <div className={styles.container}>
      <div className={styles.vignette} aria-hidden />

      <div className={styles.body}>
        <h1 className={styles.headline}>
          Your workspace is <em>ready</em> for its first component.
        </h1>

        <p className={styles.sub}>Components will appear here as they're built.</p>

        {/* Primary — prompt Hope in the chat (minimal mode only) */}
        {isMinimal && (
          <>
            <div className={styles.hopeCallout}>
              <HopeAiIcon size={32} className={styles.hopeIcon} />
              <div className={styles.hopeText}>
                <div className={styles.hopeTitle}>Prompt Hope in the chat</div>
                <div className={styles.hopeHelp}>
                  Describe what you want to build, from one prompt to a whole company.
                </div>
              </div>
            </div>

            {/* OR separator */}
            <div className={styles.sep}>
              <div className={styles.sepLine} />
              <span className={styles.sepLabel}>or do it yourself</span>
              <div className={styles.sepLine} />
            </div>
          </>
        )}

        {/* DIY CLI options */}
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

      <div className={styles.bottom}>
        <IconLink
          href="https://github.com/teambit/bit"
          src="https://static.bit.dev/harmony/github.svg"
          label="Bit on GitHub"
        />
        <a
          href={DISCORD_URL}
          className={styles.iconLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Bit community on Discord"
        >
          <Icon of="discord" className={styles.discordIcon} />
        </a>
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
