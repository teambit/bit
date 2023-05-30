import React, { useState, useRef, useCallback } from 'react';
import { H6 } from '@teambit/documenter.ui.heading';
import { CodeEditor } from '@teambit/code.ui.code-editor';
import { useLocation } from '@teambit/base-react.navigation.link';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import classnames from 'classnames';
import { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { APIRefQueryParams } from '@teambit/api-reference.hooks.use-api-ref-url';
import { useNavigate } from 'react-router-dom';
import { APINode } from '@teambit/api-reference.models.api-reference-model';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';
import { OnMount, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

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

  const signatureEditorRef = useRef<monaco.editor.IStandaloneCodeEditor>();
  const signatureMonacoRef = useRef<Monaco>();

  const exampleEditorRef = useRef<monaco.editor.IStandaloneCodeEditor>();
  const exampleMonacoRef = useRef<Monaco>();

  const routeToAPICmdId = useRef<string | null>(null);
  const apiUrlToRoute = useRef<string | null>(null);

  const hoverProviderDispose = useRef<any>();

  const rootRef = useRef() as React.MutableRefObject<HTMLDivElement>;
  const apiRef = useRef<HTMLDivElement | null>(null);

  const signatureContainerRef = useRef<HTMLDivElement | null>(null);
  const exampleContainerRef = useRef<HTMLDivElement | null>(null);

  const [signatureHeight, setSignatureHeight] = useState<string | undefined>();
  const [exampleHeight, setExampleHeight] = useState<string | undefined>();

  const [containerSize] = useState<{ width?: number; height?: number }>({
    width: undefined,
    height: undefined,
  });

  const currentQueryParams = query.toString();
  const signatureHeightStyle = (!!signatureHeight && `calc(${signatureHeight} + 16px)`) || '250px';
  const exampleHeightStyle = (!!exampleHeight && `calc(${exampleHeight} + 16px)`) || '250px';

  const indexHidden = (containerSize.width ?? 0) < INDEX_THRESHOLD_WIDTH;

  const example = (doc?.tags || []).find((tag) => tag.tagName === 'example');
  const comment = doc?.comment;
  const signature = displaySignature || defaultSignature;

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

  const getDisplayedLineCount = (editorInstance, containerWidth) => {
    if (!signatureMonacoRef.current) return 0;

    const model = editorInstance.getModel();

    if (!model) {
      return 0;
    }

    const lineCount = model.getLineCount();

    let displayedLines = 0;

    const lineWidth = editorInstance.getOption(signatureMonacoRef.current.editor.EditorOption.wordWrapColumn);
    const fontWidthApproximation = 8;

    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
      const line = model.getLineContent(lineNumber);
      const length = line.length || 1;
      const lineFitsContainer = length * fontWidthApproximation <= containerWidth;
      const wrappedLineCount = (lineFitsContainer ? 1 : Math.ceil(length / lineWidth)) || 1;
      displayedLines += wrappedLineCount;
    }

    return displayedLines;
  };

  const updateEditorHeight =
    (
      setHeight: React.Dispatch<React.SetStateAction<string | undefined>>,
      editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>
    ) =>
    () => {
      if (!signatureMonacoRef.current) return undefined;

      const editor = editorRef.current;

      if (!editor) {
        return undefined;
      }

      const lineHeight = editor.getOption(signatureMonacoRef.current.editor.EditorOption.lineHeight);

      const paddingTop = editor.getOption(signatureMonacoRef.current.editor.EditorOption.padding)?.top || 0;
      const paddingBottom = editor.getOption(signatureMonacoRef.current.editor.EditorOption.padding)?.bottom || 0;
      const glyphMargin = editor.getOption(signatureMonacoRef.current.editor.EditorOption.glyphMargin);
      const lineNumbers = editor.getOption(signatureMonacoRef.current.editor.EditorOption.lineNumbers);

      const glyphMarginHeight = glyphMargin ? lineHeight : 0;
      const lineNumbersHeight = lineNumbers.renderType !== 0 ? lineHeight : 0;

      const containerWidth = editor.getLayoutInfo().contentWidth;
      const displayedLines = getDisplayedLineCount(editor, containerWidth);

      const contentHeight =
        displayedLines * lineHeight + paddingTop + paddingBottom + glyphMarginHeight + lineNumbersHeight;

      const domNode = editor.getDomNode()?.parentElement;

      if (!domNode) {
        return undefined;
      }

      domNode.style.height = `${contentHeight}px`;
      signatureEditorRef.current?.layout();
      setHeight(() => `${contentHeight}px`);
      return undefined;
    };

  const handleEditorDidMount: (
    monacoRef: React.MutableRefObject<Monaco | undefined>,
    editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>,
    containerRef: React.MutableRefObject<HTMLDivElement | null>,
    setHeight: React.Dispatch<React.SetStateAction<string | undefined>>,
    onMount?: (monaco: Monaco, editor: monaco.editor.IStandaloneCodeEditor) => void,
    onUnMount?: () => void
  ) => OnMount = (monacoRef, editorRef, containerRef, setHeight, onMount, unMount) => (editor, _monaco) => {
    /**
     * disable syntax check
     * ts cant validate all types because imported files aren't available to the editor
     */
    monacoRef.current = _monaco;
    editorRef.current = editor;

    monacoRef.current.languages?.typescript?.typescriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    monacoRef.current?.languages.typescript.typescriptDefaults.setCompilerOptions({
      jsx: monacoRef.current.languages.typescript.JsxEmit.Preserve,
      target: monacoRef.current.languages.typescript.ScriptTarget.ES2020,
      esModuleInterop: true,
    });

    monaco.editor.defineTheme('bit', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'scrollbar.shadow': '#222222',
        'diffEditor.insertedTextBackground': '#1C4D2D',
        'diffEditor.removedTextBackground': '#761E24',
        'editor.selectionBackground': '#5A5A5A',
        'editor.overviewRulerBorder': '#6a57fd',
        'editor.lineHighlightBorder': '#6a57fd',
      },
    });

    monaco.editor.setTheme('bit');

    onMount?.(monacoRef.current, editorRef.current);

    const containerElement = containerRef.current;

    let resizeObserver: ResizeObserver | undefined;

    if (containerElement) {
      resizeObserver = new ResizeObserver(() => {
        setTimeout(() => updateEditorHeight(setHeight, editorRef));
      });
      resizeObserver.observe(containerElement);
    }

    updateEditorHeight(setHeight, editorRef);

    editor.onDidDispose(() => {
      containerElement && resizeObserver?.unobserve(containerElement);
      unMount?.();
    });
  };

  React.useLayoutEffect(() => {
    if (signatureMonacoRef.current) updateEditorHeight(setSignatureHeight, signatureEditorRef)();
  }, [signatureMonacoRef.current]);

  React.useLayoutEffect(() => {
    if (exampleMonacoRef.current) updateEditorHeight(setExampleHeight, exampleEditorRef)();
  }, [exampleMonacoRef.current]);

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
            ref={signatureContainerRef}
            style={{
              minHeight: signatureHeightStyle,
              maxHeight: signatureHeightStyle,
              height: signatureHeightStyle,
            }}
          >
            <CodeEditor
              options={defaultCodeEditorOptions}
              fileContent={signature}
              filePath={`${currentQueryParams}-${filePath}`}
              className={styles.editor}
              beforeMount={(_monaco) => {
                signatureMonacoRef.current = _monaco;
              }}
              onChange={() => {
                updateEditorHeight(setSignatureHeight, signatureEditorRef)();
              }}
              onMount={handleEditorDidMount(
                signatureMonacoRef,
                signatureEditorRef,
                signatureContainerRef,
                setSignatureHeight,
                (_monaco, _editor) => {
                  routeToAPICmdId.current =
                    _editor.addCommand(0, () => {
                      apiUrlToRoute.current && navigate(apiUrlToRoute.current);
                    }) ?? null;

                  if (!hoverProviderDispose.current) {
                    hoverProviderDispose.current = _monaco.languages.registerHoverProvider('typescript', {
                      provideHover: hoverProvider,
                    });
                  }
                },
                () => {
                  hoverProviderDispose.current?.dispose();
                }
              )}
            />
          </div>
        )}
        {example && example.comment && (
          <div className={styles.apiNodeDetailsExample}>
            <H6 className={styles.apiNodeDetailsExampleTitle}>Example</H6>
            <div
              className={styles.codeEditorContainer}
              ref={exampleContainerRef}
              style={{
                minHeight: exampleHeightStyle,
                maxHeight: exampleHeightStyle,
                height: exampleHeightStyle,
              }}
            >
              <CodeEditor
                options={defaultCodeEditorOptions}
                fileContent={example.comment}
                filePath={`${example?.location.line}:${example?.location.filePath}`}
                className={styles.editor}
                onMount={handleEditorDidMount(
                  exampleMonacoRef,
                  exampleEditorRef,
                  exampleContainerRef,
                  setExampleHeight
                )}
                onChange={() => {
                  updateEditorHeight(setExampleHeight, exampleEditorRef)();
                }}
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
