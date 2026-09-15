import React, { useEffect, useRef, useState } from 'react';
import { H6 } from '@teambit/documenter.ui.heading';
import { CodeEditor } from '@teambit/code.ui.code-editor';
import classnames from 'classnames';
import type { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';

import { extractCodeBlock } from './extract-code-block';
import styles from './api-node-details.module.scss';

const INDEX_THRESHOLD_WIDTH = 600;

export type APINodeDetailsProps = APINodeRenderProps & {
  displaySignature?: string;
  options?: {
    hideIndex?: boolean;
  };
};

export function APINodeDetails({
  apiNode: {
    api: {
      signature: defaultSignature,
      doc,
      location: { filePath },
    },
  },
  displaySignature,
  children,
  // retained in the public renderer contract; this component does not render child nodes itself.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  renderers: _renderers,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apiRefModel: _apiRefModel,
  options,
  ...rest
}: APINodeDetailsProps) {
  const query = useQuery();
  const rootRef = useRef<HTMLDivElement | null>(null) as React.MutableRefObject<HTMLDivElement>;
  const [containerSize, setContainerSize] = useState<{ width?: number }>({});
  const currentQueryParams = query.toString();
  const indexHidden = (containerSize.width ?? 0) < INDEX_THRESHOLD_WIDTH;

  useEffect(() => {
    const container = rootRef.current;
    if (!container) return undefined;

    const updateSize = () => setContainerSize({ width: container.getBoundingClientRect().width });
    updateSize();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [currentQueryParams]);

  const example = (doc?.tags || []).find((tag) => tag.tagName === 'example');
  const comment =
    doc?.comment ?? doc?.tags?.filter((tag) => tag.comment).reduce((acc, tag) => acc.concat(`${tag.comment}\n`), '');
  const linkComment = doc?.tags?.find((tag) => tag.tagName === 'link')?.comment;

  let linkPlaceholder: string | undefined;
  let linkURL: string | undefined;
  if (linkComment) {
    const parts = linkComment.split(' ');
    linkURL = parts.find((part) => part.startsWith('http'));
    linkPlaceholder = parts.filter((part) => part !== linkURL).join(' ');
  }

  const signature = displaySignature || defaultSignature;
  const extractedExample = example?.comment ? extractCodeBlock(example.comment) : undefined;

  return (
    <div
      ref={rootRef}
      key={currentQueryParams}
      {...rest}
      className={classnames(rest.className, styles.apiNodeDetailsContainer)}
    >
      <div className={styles.apiDetails}>
        {comment && <div className={styles.apiNodeDetailsComment}>{comment}</div>}
        {linkComment && (
          <div className={styles.apiNodeDetailsLink}>
            {linkPlaceholder && <span>{linkPlaceholder}: </span>}
            <a href={linkURL} target="_blank" rel="noopener noreferrer">
              {linkURL}
            </a>
          </div>
        )}
        {signature && (
          <div className={classnames(styles.apiNodeDetailsSignatureContainer, styles.codeEditorContainer)}>
            <CodeEditor
              fileContent={signature}
              filePath={`${currentQueryParams}-${filePath}`}
              language="typescript"
              className={styles.editor}
            />
          </div>
        )}
        {example?.comment && (
          <div className={styles.apiNodeDetailsExample}>
            <H6 className={styles.apiNodeDetailsExampleTitle}>Example</H6>
            <div className={styles.codeEditorContainer}>
              <CodeEditor
                fileContent={extractedExample?.code || example.comment}
                filePath={`example-${example.location.line}:${example.location.filePath}`}
                language={extractedExample?.lang || undefined}
                className={styles.editor}
              />
            </div>
          </div>
        )}
        {children}
      </div>
      {!options?.hideIndex && !indexHidden && (
        <SchemaNodesIndex className={styles.schemaNodesIndex} title="ON THIS PAGE" rootRef={rootRef} />
      )}
    </div>
  );
}
