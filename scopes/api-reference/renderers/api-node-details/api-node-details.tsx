import React, { HTMLAttributes, useState, useRef, useEffect, useCallback } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { Link, useLocation } from '@teambit/base-react.navigation.link';
import { SchemaNodeSummary } from '@teambit/api-reference.renderers.schema-node-summary';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import classnames from 'classnames';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';
import { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { APIRefQueryParams } from '@teambit/api-reference.hooks.use-api-ref-url';
import { useNavigate } from 'react-router-dom';

import styles from './api-node-details.module.scss';

export type APINodeDetailsProps = APINodeRenderProps & {
  members?: SchemaNode[];
  displaySignature?: string;
} & HTMLAttributes<HTMLDivElement>;

export function APINodeDetails({
  apiNode: {
    api: {
      name,
      signature: defaultSignature,
      doc,
      location: { filePath, line, character },
    },
    renderer: {
      icon: { url },
    },
  },
  members,
  displaySignature,
  children,
  apiRefModel,
}: APINodeDetailsProps) {
  const routerLocation = useLocation();
  const query = useQuery();
  const navigate = useNavigate();
  const editorRef = useRef<any>();
  const monacoRef = useRef<any>();
  const routeToAPICmdId = useRef<string | null>(null);
  const apiUrlToRoute = useRef<string | null>(null);

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

  const locationUrl = `${componentUrlWithoutVersion}~code/${filePath}${
    componentVersionFromUrl ? `?version=${componentVersionFromUrl}` : ''
  }`;

  const locationLabel = `${filePath}:${line}`;
  const hasMembers = members && members.length > 0;
  const groupedMembers = members ? Array.from(groupByNodeSignatureType(members).entries()).sort(sortSignatureType) : [];

  const getAPINodeUrl = useCallback((queryParams: APIRefQueryParams) => {
    const queryObj = Object.fromEntries(query.entries());
    const updatedObj = { ...queryObj, ...queryParams };
    const queryString = new URLSearchParams(updatedObj).toString();
    return `${routerLocation?.pathname || '/'}?${queryString}`;
  }, []);

  useEffect(() => {
    if (isMounted) {
      const container = editorRef.current.getDomNode();
      editorRef.current.onDidContentSizeChange(() => {
        if (container && isMounted) {
          const contentHeight = Math.min(1000, editorRef.current.getContentHeight() + 18);
          setSignatureHeight(contentHeight);
        }
      });
      routeToAPICmdId.current = editorRef.current.addCommand(0, () => {
        apiUrlToRoute.current && navigate(apiUrlToRoute.current);
      });
    }
  }, [isMounted]);

  useEffect(() => {
    return () => {
      setIsMounted(false);
    };
  }, []);

  return (
    <div className={styles.apiNodeDetailsContainer}>
      <div className={styles.apiNodeDetailsNameContainer}>
        <div className={styles.apiTypeIcon}>
          <img src={url} />
        </div>
        <H5 className={styles.apiNodeDetailsName}>{name}</H5>
      </div>
      {comment && <div className={styles.apiNodeDetailsComment}>{comment}</div>}
      {signature && (
        <div className={classnames(styles.apiNodeDetailsSignatureContainer, styles.codeEditorContainer)}>
          <CodeEditor
            options={defaultCodeEditorOptions}
            value={signature}
            height={signatureHeight}
            path={`${line}:${character}:${filePath}`}
            className={styles.editor}
            beforeMount={(monaco) => {
              monacoRef.current = monaco;
              monacoRef.current.languages.registerHoverProvider('typescript', {
                provideHover: (model, position) => {
                  const word = model.getWordAtPosition(position);
                  const wordApiNode = word && apiRefModel.apiByName.get(word.word);
                  const wordApiUrl =
                    wordApiNode &&
                    getAPINodeUrl({ selectedAPI: `${wordApiNode.renderer.nodeType}/${wordApiNode.api.name}` });
                  apiUrlToRoute.current = wordApiUrl;
                  return {
                    contents: wordApiUrl
                      ? [
                          {
                            value: `[View ${word.word} API](command:${routeToAPICmdId.current})`,
                            isTrusted: true,
                          },
                        ]
                      : [],
                  };
                },
              });
            }}
            onMount={(editor) => {
              editorRef.current = editor;
              setIsMounted(true);
            }}
          />
        </div>
      )}
      {example && example.comment && (
        <div className={styles.apiNodeDetailsExample}>
          <H6 className={styles.apiNodeDetailsExampleTitle}>Example</H6>
          <div className={styles.codeEditorContainer}>
            <CodeEditor
              options={defaultCodeEditorOptions}
              value={example.comment}
              path={`${example?.location.line}:${example?.location.filePath}`}
              height={exampleHeight}
            />
          </div>
        </div>
      )}
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
      {hasMembers && (
        <>
          <SchemaNodesIndex title={'Index'} nodes={members} />
          <div className={styles.apiNodeDetailsMembersContainer}>
            {groupedMembers.map(([type, groupedMembersByType]) => {
              return (
                <div key={`${type}`} className={styles.groupedMemberContainer}>
                  <div className={styles.groupName}>{type}</div>
                  {groupedMembersByType.map((member) => (
                    <SchemaNodeSummary key={`${type}-${member.__schema}-${member.name}`} node={member} />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
      {children}
    </div>
  );
}
