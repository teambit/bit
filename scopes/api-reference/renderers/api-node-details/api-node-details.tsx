import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import Editor from '@monaco-editor/react';
import { Link, useLocation } from '@teambit/base-react.navigation.link';
import { SchemaNodesSummary } from '@teambit/api-reference.renderers.schema-nodes-summary';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import classnames from 'classnames';
import { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { APIRefQueryParams } from '@teambit/api-reference.hooks.use-api-ref-url';
import { useNavigate } from 'react-router-dom';
import { APINode } from '@teambit/api-reference.models.api-reference-model';
import { CodeView } from '@teambit/code.ui.code-view';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';

import styles from './api-node-details.module.scss';

export type APINodeDetailsProps = APINodeRenderProps & {
  members?: SchemaNode[];
  displaySignature?: string;
  options?: {
    hideImplementation?: boolean;
    hideIndex?: boolean;
  };
};

export function APINodeDetails({
  apiNode: {
    api: {
      name,
      signature: defaultSignature,
      doc,
      location: { filePath, line, character },
    },
    renderer: { icon },
    componentId,
  },
  members,
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

  const componentVersionFromUrl = query.get('version');
  const pathname = routerLocation?.pathname;
  const componentUrlWithoutVersion = pathname?.split('~')[0];

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
  const [drawerOpen, onToggleDrawer] = useState(false);

  const locationUrl = `${componentUrlWithoutVersion}~code/${filePath}${
    componentVersionFromUrl ? `?version=${componentVersionFromUrl}` : ''
  }`;

  const locationLabel = `${filePath}:${line}`;
  // const hasMembers = members && members.length > 0;
  // const groupedMembers = members ? Array.from(groupByNodeSignatureType(members).entries()).sort(sortSignatureType) : [];

  const getAPINodeUrl = useCallback((queryParams: APIRefQueryParams) => {
    const queryObj = Object.fromEntries(query.entries());
    const updatedObj = { ...queryObj, ...queryParams };
    const queryString = new URLSearchParams(updatedObj).toString();
    return `${routerLocation?.pathname || '/'}?${queryString}`;
  }, []);

  const hoverProvider = useCallback((model, position) => {
    const word = model.getWordAtPosition(position);
    const wordApiNode: APINode | undefined = word ? apiRefModel?.apiByName?.get(word.word as string) : undefined;
    const wordApiUrl = wordApiNode
      ? getAPINodeUrl({ selectedAPI: `${wordApiNode.renderer.nodeType}/${wordApiNode.api.name}` })
      : null;
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
      editorRef.current.onDidContentSizeChange(({ contentHeight, contentWidthChanged }) => {
        if (container && isMounted && signature) {
          const updatedHeight = contentWidthChanged ? Math.min(200, contentHeight + 18) : signatureHeight;
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

  useEffect(() => {
    return () => {
      hoverProviderDispose.current?.dispose();
      setIsMounted(false);
    };
  }, []);

  return (
    /**
     * the key is set to the the url params to force it to re-render when the query params change
     * otherwise the rootRef never changes and index is unable to auto detect elements
     */
    <div
      ref={rootRef}
      key={query.toString()}
      {...rest}
      className={classnames(rest.className, styles.apiNodeDetailsContainer)}
    >
      <div className={styles.apiDetails}>
        {name && (
          <div className={styles.apiNodeDetailsNameContainer}>
            {icon && (
              <div className={styles.apiTypeIcon}>
                <img src={icon.url} />
              </div>
            )}
            <H5 className={styles.apiNodeDetailsName}>{name}</H5>
          </div>
        )}
        {comment && <div className={styles.apiNodeDetailsComment}>{comment}</div>}
        {signature && (
          <div className={classnames(styles.apiNodeDetailsSignatureContainer, styles.codeEditorContainer)}>
            <Editor
              options={defaultCodeEditorOptions}
              value={signature}
              height={signatureHeight}
              path={`${line}:${character}:${filePath}`}
              className={styles.editor}
              beforeMount={(monaco) => {
                monacoRef.current = monaco;
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                setIsMounted(true);
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
        {!options?.hideImplementation && (
          <div className={styles.apiNodeImplementationDrawerContainer}>
            <DrawerUI
              isOpen={drawerOpen}
              onToggle={() => onToggleDrawer((open) => !open)}
              contentClass={styles.apiNodeImplementationDrawerContent}
              className={styles.apiNodeImplementationDrawer}
              name={
                <div className={styles.apiNodeDetailsLocationContainer}>
                  <div className={styles.apiNodeDetailsLocationIcon}>
                    <img src="https://static.bit.dev/design-system-assets/Icons/external-link.svg"></img>
                  </div>
                  <div className={styles.apiNodeDetailsLocation}>
                    <Link external={true} href={locationUrl} className={styles.apiNodeDetailsLocationLink}>
                      {locationLabel}
                    </Link>
                  </div>
                </div>
              }
            >
              <CodeView
                componentId={componentId}
                currentFile={filePath}
                className={styles.apiNodeImplementationCodeView}
              />
            </DrawerUI>
          </div>
        )}
        {members && <SchemaNodesSummary className={styles.apiNodeDetailsMembersContainer} nodes={members} />}
        {children}
      </div>
      {!options?.hideIndex && (
        <SchemaNodesIndex className={styles.schemaNodesIndex} title={'Index'} rootRef={rootRef} />
      )}
    </div>
  );
}
