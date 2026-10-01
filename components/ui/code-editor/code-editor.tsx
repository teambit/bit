import React from 'react';
import classnames from 'classnames';
import {
  langFromFileName,
  normalizeLanguage,
  resolveTokenColor,
  useHighlightedLines,
} from '@teambit/code.ui.diff-viewer';
import styles from './code-editor.module.scss';

/**
 * Kept deliberately broad for backwards compatibility with consumers that still pass the old
 * Monaco callbacks and options. The static renderer does not execute them.
 */
type LegacyEditorCallback = (...args: any[]) => void;
type LegacyEditorComponent = React.ComponentType<any>;

export type CodeEditorProps = {
  filePath?: string;
  fileContent?: string;
  language?: string;
  height?: string;
  className?: string;
  options?: Record<string, any>;
  beforeMount?: LegacyEditorCallback;
  onMount?: LegacyEditorCallback;
  onChange?: LegacyEditorCallback;
  Loader?: React.ReactNode;
  Editor?: LegacyEditorComponent | null;
};

/**
 * @deprecated Monaco-specific options are ignored by the static code renderer.
 */
export const DEFAULT_EDITOR_OPTIONS: Record<string, any> = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'off',
};

function HighlightedCode({ content, language }: { content: string; language?: string }) {
  const lines = useHighlightedLines(content, language);

  if (!lines) return <>{content}</>;

  return (
    <>
      {lines.map((tokens, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 ? '\n' : null}
          {tokens.map((token, tokenIndex) => {
            const color = resolveTokenColor(token.color);
            return (
              <span key={tokenIndex} style={color ? { color } : undefined}>
                {token.content}
              </span>
            );
          })}
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * Read-only code renderer used by API Reference.
 *
 * This component intentionally retains the former Monaco-shaped props so independently-versioned
 * API renderer components can migrate without a coordinated release. Rendering is now handled by
 * the shared Shiki highlighter and does not load executable editor code from a CDN.
 */
export function CodeEditor({ fileContent = '', filePath, language, className, height }: CodeEditorProps) {
  const resolvedLanguage = normalizeLanguage(language) || langFromFileName(filePath) || 'typescript';

  return (
    <section
      className={classnames(styles.codeEditor, className)}
      style={height ? { height } : undefined}
      data-code-renderer="shiki"
    >
      <pre className={styles.pre}>
        <code>
          <HighlightedCode content={fileContent} language={resolvedLanguage} />
        </code>
      </pre>
    </section>
  );
}
