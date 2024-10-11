import React, { HTMLAttributes } from 'react';
import { SchemaNode, EnumMemberSchema, SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';
import { transformSignature } from '@teambit/api-reference.utils.schema-node-signature-transform';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
import { APINodeRenderProps, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { VariableNodeSummary, EnumMemberSummary } from '@teambit/api-reference.renderers.schema-node-member-summary';
import { parameterRenderer as defaultParamRenderer } from '@teambit/api-reference.renderers.parameter';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import defaultTheme from '@teambit/api-reference.utils.custom-prism-syntax-highlighter-theme';
import { Link as BaseLink } from '@teambit/base-react.navigation.link';
import pluralize from 'pluralize';
import classnames from 'classnames';

import styles from './grouped-schema-nodes-overview-summary.module.scss';

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

export type SchemaNodesSummaryProps = {
  name: string;
  // signature?: string;
  description?: string;
  icon?: { name: string; url: string };
  nodes: SchemaNode[];
  apiNodeRendererProps: APINodeRenderProps;
  headings?: Record<string, string[]>;
  renderTable?(type: string, member: SchemaNode, headings?: string[]): React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const DEFAULT_HEADINGS = {
  methods: ['name', 'signature', 'description'],
  constructors: ['name', 'signature', 'description'],
  'enum members': ['name', 'description'],
  properties: ['name', 'type', 'default', 'description'],
  setters: ['name', 'signature', 'description'],
  default: ['name', 'type', 'description'],
};

const defaultTableRenderer = function DefaultTableRendererWrapper(apiNodeRendererProps: APINodeRenderProps) {
  return function DefaultTableRenderer(type: string, member: SchemaNode, headings: string[]) {
    const typeId = type && encodeURIComponent(type);

    if (type === 'enum members') {
      return (
        <EnumMemberSummary
          key={`${member.__schema}-${member.name}`}
          headings={headings}
          apiNodeRendererProps={apiNodeRendererProps}
          groupElementClassName={typeId}
          name={(member as EnumMemberSchema).name}
          node={member as EnumMemberSchema}
        />
      );
    }

    return (
      <VariableNodeSummary
        key={`${member.__schema}-${member.name}`}
        node={member}
        headings={headings}
        groupElementClassName={typeId}
        apiNodeRendererProps={apiNodeRendererProps}
        name={member.name || member.signature || ''}
        type={(member as any).type}
        isOptional={(member as any).isOptional}
        defaultValue={(member as any).defaultValue}
      />
    );
  };
};

export function SchemaNodesSummary({
  name,
  description,
  icon,
  nodes,
  // signature,
  apiNodeRendererProps,
  headings: headingsFromProps = {},
  // skipNode,
  // skipGrouping,
  renderTable = defaultTableRenderer(apiNodeRendererProps),
  className,
  ...rest
}: SchemaNodesSummaryProps) {
  const hasNodes = nodes.length > 0;
  const headings = {
    ...DEFAULT_HEADINGS,
    ...headingsFromProps,
  };

  const groupedNodes = hasNodes
    ? Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType)
    : (hasNodes && [['', nodes] as [string, SchemaNode[]]]) || [];

  const rootRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={rootRef} {...rest} className={classnames(styles.groupNodesContainer, className)}>
      <div className={styles.heading}>
        <div className={styles.headingLeft}>
          {icon && (
            <div className={styles.icon}>
              <img src={icon.url} alt={icon.name}></img>
            </div>
          )}
          <div className={styles.title}>
            <Link href={`~api-reference?selectedAPI=${name}`}>{name}</Link>
          </div>
        </div>
      </div>
      {description && <div className={styles.description}>{description}</div>}
      {groupedNodes.map(([type, groupedMembersByType], index) => {
        const skipRenderingTable = type === 'methods' || type === 'constructors' || type === 'setters';
        const _headings = (type && headings[type]) || headings.default;

        return (
          <div key={`${type}-${index}`} className={classnames(styles.memberSummary)}>
            {!skipRenderingTable && (
              <div className={styles.propertiesOverview}>
                <div className={styles.propertiesTitle}>
                  {type === 'enum members' ? 'Members' : pluralize(type ?? 'properties')}
                </div>
                <div className={styles.table}>
                  <HeadingRow
                    className={classnames(styles.row, styles.headingRow)}
                    colNumber={_headings.length as any}
                    headings={_headings}
                  />
                  {groupedMembersByType.map((member) => {
                    return renderTable(type ?? '', member, _headings);
                  })}
                </div>
              </div>
            )}
            {skipRenderingTable && (
              <div className={styles.methodMembers}>
                {groupedMembersByType.map((member) => (
                  <SchemaMethodMember
                    key={`${member.__schema}-${member.name}`}
                    member={member}
                    apiNodeRendererProps={apiNodeRendererProps}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SchemaMethodMember({
  member,
  apiNodeRendererProps,
}: {
  member: SchemaNode;
  apiNodeRendererProps: APINodeRenderProps;
}) {
  const memberSignature =
    member.__schema === SetAccessorSchema.name
      ? `(${(member as SetAccessorSchema).param.toString()}) => void`
      : (transformSignature(member)?.split(member.name ?? '')[1] ?? member.signature);

  const { renderers } = apiNodeRendererProps;
  const { doc } = member;
  const returnType = (member as any).returnType;
  const returnTypeRenderer = returnType && renderers.find((renderer) => renderer.predicate(returnType));
  const paramTypeHeadings = ['Parameter', 'type', 'default', 'description'];
  const params = (member as any).params || [(member as any).param];
  const filePath = apiNodeRendererProps.apiNode.api.location.filePath;
  const lang = React.useMemo(() => {
    const langFromFileEnding = filePath?.split('.').pop();
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    if (langFromFileEnding === 'mdx') return 'md';
    return langFromFileEnding;
  }, [filePath]);

  return (
    <div className={styles.memberDetails} key={`${member.__schema}-${member.name}`}>
      <div className={styles.collapsedRow}>
        <div className={styles.memberTitle}>{member.name}</div>
        {memberSignature && (
          <div className={styles.signature}>
            <SyntaxHighlighter
              language={lang}
              style={defaultTheme}
              customStyle={{
                borderRadius: '8px',
                marginTop: '4px',
                padding: '6px',
              }}
            >
              {memberSignature}
            </SyntaxHighlighter>
          </div>
        )}
      </div>

      <div className={styles.expandedRow}>
        <div className={styles.leftPlaceholder}></div>
        <div className={styles.expandedRowDetails}>
          {doc?.comment && <div className={styles.description}>{doc?.comment || ''}</div>}
          {params.length > 0 && (
            <div className={styles.paramsContainer}>
              <HeadingRow className={styles.paramHeading} headings={paramTypeHeadings} colNumber={4} />
              {params.map((param) => {
                const paramRenderer = renderers.find((renderer) => renderer.predicate(param));
                if (paramRenderer?.Component) {
                  return (
                    <paramRenderer.Component
                      {...apiNodeRendererProps}
                      key={`param-${param.name}`}
                      depth={(apiNodeRendererProps.depth ?? 0) + 1}
                      apiNode={{ ...apiNodeRendererProps.apiNode, renderer: paramRenderer, api: param }}
                      metadata={{ [param.__schema]: { columnView: true, skipHeadings: true } }}
                    />
                  );
                }
                return (
                  <defaultParamRenderer.Component
                    {...apiNodeRendererProps}
                    key={`param-${param.name}`}
                    depth={(apiNodeRendererProps.depth ?? 0) + 1}
                    apiNode={{ ...apiNodeRendererProps.apiNode, renderer: defaultParamRenderer, api: param }}
                    metadata={{ [param.__schema]: { columnView: true, skipHeadings: true } }}
                  />
                );
              })}
            </div>
          )}
          {returnType && (
            <div className={styles.returnContainer}>
              <h3 className={styles.subtitle}>Returns</h3>
              {(returnTypeRenderer && (
                <returnTypeRenderer.Component
                  {...apiNodeRendererProps}
                  apiNode={{ ...apiNodeRendererProps.apiNode, api: returnType, renderer: returnTypeRenderer }}
                  depth={(apiNodeRendererProps.depth ?? 0) + 1}
                  metadata={{ ...apiNodeRendererProps.metadata, [returnType.__schema]: { columnView: true } }}
                />
              )) || <div className={nodeStyles.node}>{returnType.toString()}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
