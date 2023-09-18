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

  // const [signatureHeight, setSignatureHeight] = useState<string | undefined>();
  // const [exampleHeight, setExampleHeight] = useState<string | undefined>();

  const [containerSize] = useState<{ width?: number; height?: number }>({
    width: undefined,
    height: undefined,
  });

  const currentQueryParams = query.toString();
  // const signatureHeightStyle = (!!signatureHeight && `calc(${signatureHeight} + 16px)`) || '250px';
  // const exampleHeightStyle = (!!exampleHeight && `calc(${exampleHeight} + 16px)`) || '250px';

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
    const wordApiNode: APINode | undefined = word
      ? apiRefModel?.apiByName?.get(word.word) ||
        apiRefModel?.apiByName?.get(apiRefModel.generateInternalAPIKey(filePath, word.word))
      : undefined;
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

  const getDisplayedLineCount = (editorInstance, containerWidth, monacoRef) => {
    if (!monacoRef.current) return 0;

    const model = editorInstance.getModel();

    if (!model) {
      return 0;
    }

    const lineCount = model.getLineCount();

    let displayedLines = 0;

    const lineWidth = editorInstance.getOption(monacoRef.current.editor.EditorOption.wordWrapColumn);
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
      editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>,
      monacoRef: React.MutableRefObject<Monaco | undefined>
    ) =>
    () => {
      if (!monacoRef.current) return undefined;

      const editor = editorRef.current;

      if (!editor) {
        return undefined;
      }

      const lineHeight = editor.getOption(monacoRef.current.editor.EditorOption.lineHeight);

      const paddingTop = editor.getOption(monacoRef.current.editor.EditorOption.padding)?.top || 0;
      const paddingBottom = editor.getOption(monacoRef.current.editor.EditorOption.padding)?.bottom || 0;
      const glyphMargin = editor.getOption(monacoRef.current.editor.EditorOption.glyphMargin);
      const lineNumbers = editor.getOption(monacoRef.current.editor.EditorOption.lineNumbers);

      const glyphMarginHeight = glyphMargin ? lineHeight : 0;
      const lineNumbersHeight = lineNumbers.renderType !== 0 ? lineHeight : 0;

      const containerWidth = editor.getLayoutInfo().contentWidth;
      const displayedLines = getDisplayedLineCount(editor, containerWidth, monacoRef);

      const contentHeight =
        displayedLines * lineHeight + paddingTop + paddingBottom + glyphMarginHeight + lineNumbersHeight;

      const domNode = editor.getDomNode()?.parentElement;

      if (!domNode) {
        return undefined;
      }

      const newHeight = `${contentHeight}px`;
      if (domNode.style.height === newHeight) {
        return undefined;
      }
      domNode.style.height = newHeight;
      editorRef.current?.layout();
      // setHeight(() => newHeight);
      return undefined;
    };

  // const updateEditorHeight = _.throttle<typeof _updateEditorHeight>(_updateEditorHeight, 300) as _.DebouncedFunc<any>;

  const handleEditorDidMount: (
    monacoRef: React.MutableRefObject<Monaco | undefined>,
    editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>,
    containerRef: React.MutableRefObject<HTMLDivElement | null>,
    setHeight?: React.Dispatch<React.SetStateAction<string | undefined>>,
    onMount?: (monaco: Monaco, editor: monaco.editor.IStandaloneCodeEditor) => void,
    onUnMount?: () => void
  ) => OnMount = React.useCallback(
    (monacoRef, editorRef, containerRef, setHeight, onMount, unMount) => (editor, _monaco) => {
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

      updateEditorHeight(editorRef, monacoRef)();

      editor.onDidDispose(() => {
        unMount?.();
      });
    },
    []
  );

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
            className={classnames(styles.apiNodeDetailsSignatureContainer, styles.codeEditorContainer)}
            ref={signatureContainerRef}
          >
            <CodeEditor
              options={defaultCodeEditorOptions}
              fileContent={signature}
              filePath={`${currentQueryParams}-${filePath}`}
              className={styles.editor}
              beforeMount={(_monaco) => {
                signatureMonacoRef.current = _monaco;
              }}
              onMount={handleEditorDidMount(
                signatureMonacoRef,
                signatureEditorRef,
                signatureContainerRef,
                undefined,
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
            <div className={classnames(styles.codeEditorContainer)} ref={exampleContainerRef}>
              <CodeEditor
                options={defaultCodeEditorOptions}
                fileContent={extractCodeBlock(example.comment)?.code || example.comment}
                filePath={`example-${example?.location.line}:${example?.location.filePath}`}
                language={extractCodeBlock(example.comment)?.lang || undefined}
                className={styles.editor}
                beforeMount={(_monaco) => {
                  exampleMonacoRef.current = _monaco;
                }}
                onMount={handleEditorDidMount(exampleMonacoRef, exampleEditorRef, exampleContainerRef)}
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

/**
 * Extracts the code block and its language specifier enclosed between triple backticks (```) from a given text string.
 *
 * @param text - The text string from which to extract the code block.
 *
 * @returns An object containing the extracted code and language specifier, or null if no match is found.
 */
function extractCodeBlock(text: string): { lang: string; code: string } | null {
  // The (?<lang>[\w+-]*) captures the optional language specifier (like 'typescript', 'javascript', etc.)
  // The (?<code>[\s\S]*?) captures the actual code block
  const regex = /```(?<lang>[\w+-]*)\n(?<code>[\s\S]*?)```/;
  const match = text.match(regex);

  if (match && match.groups) {
    const { lang, code } = match.groups;
    return { lang, code };
  }
  return null;
}
