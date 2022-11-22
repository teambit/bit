import React, { useState, useRef, useEffect, useCallback } from 'react';
import { H6 } from '@teambit/documenter.ui.heading';
import Editor from '@monaco-editor/react';
import { useLocation } from '@teambit/base-react.navigation.link';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import classnames from 'classnames';
import { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { APIRefQueryParams } from '@teambit/api-reference.hooks.use-api-ref-url';
import { useNavigate } from 'react-router-dom';
import { APINode } from '@teambit/api-reference.models.api-reference-model';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';

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
      name,
      signature: defaultSignature,
      doc,
      location: { filePath },
    },
  },
  displaySignature,
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  renderers,
  apiRefModel,
  options,
  ...rest
}: APINodeDetailsProps) {
  const routerLocation = useLocation();
  const query = useQuery();
  const navigate = useNavigate();
  const editorRef = useRef<any>();
  const monacoRef = useRef<any>();
  const routeToAPICmdId = useRef<string | null>(null);
  const apiUrlToRoute = useRef<string | null>(null);
  const hoverProviderDispose = useRef<any>();
  const rootRef = useRef() as React.MutableRefObject<HTMLDivElement>;
  const apiRef = useRef<HTMLDivElement | null>(null);
  const currentQueryParams = query.toString();
  const [containerSize, setContainerSize] = useState<{ width?: number; height?: number }>({
    width: undefined,
    height: undefined,
  });
  const indexHidden = (containerSize.width ?? 0) < INDEX_THRESHOLD_WIDTH;

  const example = (doc?.tags || []).find((tag) => tag.tagName === 'example');
  const comment = doc?.comment;
  const signature = displaySignature || defaultSignature;
  /**
   * @HACK
   * Make Monaco responsive
   * default line height: 18px;
   * totalHeight: (no of lines * default line height)
   */
  const exampleHeight = (example?.comment?.split('\n').length || 0) * 18;
  const defaultSignatureHeight = 36 + ((signature?.split('\n').length || 0) - 1) * 18;

  const [signatureHeight, setSignatureHeight] = useState<number>(defaultSignatureHeight);
  const [isMounted, setIsMounted] = useState(false);

  const getAPINodeUrl = useCallback((queryParams: APIRefQueryParams) => {
    const queryObj = Object.fromEntries(query.entries());
    const updatedObj = { ...queryObj, ...queryParams };
    const queryString = new URLSearchParams(updatedObj).toString();
    return `${routerLocation?.pathname || '/'}?${queryString}`;
  }, []);

  const hoverProvider = useCallback((model, position) => {
    const word = model.getWordAtPosition(position);
    const wordApiNode: APINode | undefined = word ? apiRefModel?.apiByName?.get(word.word as string) : undefined;
    const wordApiUrl = wordApiNode ? getAPINodeUrl({ selectedAPI: wordApiNode.api.name }) : null;
    apiUrlToRoute.current = wordApiUrl;
    if (!wordApiUrl || wordApiNode?.api.name === name) return undefined;
    const contents = [
      {
        value: `[View ${word.word} API](command:${routeToAPICmdId.current})`,
        isTrusted: true,
      },
    ];
    return {
      contents,
    };
  }, []);

  useEffect(() => {
    if (isMounted && signature) {
      monacoRef.current.languages.typescript.typescriptDefaults.setCompilerOptions({
        jsx: monacoRef.current.languages.typescript.JsxEmit.Preserve,
        target: monacoRef.current.languages.typescript.ScriptTarget.ES2020,
        esModuleInterop: true,
      });
      ``;
      monacoRef.current.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
      const container = editorRef.current.getDomNode();
      editorRef.current.onDidContentSizeChange(({ contentHeight }) => {
        if (container && isMounted && signature) {
          const updatedHeight = Math.min(200, contentHeight + 18);
          setSignatureHeight(updatedHeight);
        }
      });
      routeToAPICmdId.current = editorRef.current.addCommand(0, () => {
        apiUrlToRoute.current && navigate(apiUrlToRoute.current);
      });
      if (!hoverProviderDispose.current) {
        hoverProviderDispose.current = monacoRef.current.languages.registerHoverProvider('typescript', {
          provideHover: hoverProvider,
        });
      }
    }
  }, [isMounted]);

  const handleSize = useCallback(() => {
    setContainerSize({
      width: rootRef.current.offsetWidth,
      height: rootRef.current.offsetHeight,
    });
  }, []);

  useEffect(() => {
    if (window) window.addEventListener('resize', handleSize);
    // Call handler right away so state gets updated with initial container size
    handleSize();
    return () => {
      hoverProviderDispose.current?.dispose();
      if (window) window.removeEventListener('resize', handleSize);
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    handleSize();
  }, [rootRef?.current?.offsetHeight, rootRef?.current?.offsetWidth]);

  return (
    /**
     * the key is set to the the url params to force it to re-render when the query params change
     * otherwise the rootRef never changes and index is unable to auto detect elements
     */
    <div
      ref={rootRef}
      key={currentQueryParams}
      {...rest}
      className={classnames(rest.className, styles.apiNodeDetailsContainer)}
    >
      <div className={styles.apiDetails} ref={apiRef}>
        {comment && <div className={styles.apiNodeDetailsComment}>{comment}</div>}
        {signature && (
          <div
            key={`${signature}-${currentQueryParams}-api-signature-editor`}
            className={classnames(styles.apiNodeDetailsSignatureContainer, styles.codeEditorContainer)}
          >
            <Editor
              options={defaultCodeEditorOptions}
              value={signature}
              height={signatureHeight}
              path={`${currentQueryParams}-${filePath}`}
              className={styles.editor}
              beforeMount={(monaco) => {
                monacoRef.current = monaco;
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                const signatureContent = editorRef.current.getValue();
                const updatedSignatureHeight = 36 + ((signatureContent?.split('\n').length || 0) - 1) * 18;
                setIsMounted(true);
                setSignatureHeight(updatedSignatureHeight);
              }}
              theme={'vs-dark'}
            />
          </div>
        )}
        {example && example.comment && (
          <div className={styles.apiNodeDetailsExample}>
            <H6 className={styles.apiNodeDetailsExampleTitle}>Example</H6>
            <div className={styles.codeEditorContainer}>
              <Editor
                options={defaultCodeEditorOptions}
                value={example.comment}
                path={`${example?.location.line}:${example?.location.filePath}`}
                height={exampleHeight}
                theme={'vs-dark'}
                className={styles.editor}
              />
            </div>
          </div>
        )}
        {children}
      </div>
      {!options?.hideIndex && !indexHidden && (
        <SchemaNodesIndex className={styles.schemaNodesIndex} title={'ON THIS PAGE'} rootRef={rootRef} />
      )}
    </div>
  );
}
