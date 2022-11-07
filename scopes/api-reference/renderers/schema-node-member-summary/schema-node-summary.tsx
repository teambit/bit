// import React, { HTMLAttributes } from 'react';
// import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
// import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
// // import Editor from '@monaco-editor/react';
// // import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
// import { TypeInfoFromSchemaNode } from '@teambit/api-reference.utils.type-info-from-schema-node';
// import { TableRow } from '@teambit/documenter.ui.table-row';
// import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
// import classnames from 'classnames';

// import styles from './schema-node-summary.module.scss';

// export type SchemaNodeSummaryProps = {
//   // signature?: string;
//   isOptional?: boolean;
//   groupElementClassName?: string;
//   node: SchemaNode;
//   headings: string[];
//   apiRefModel: APIReferenceModel;
//   getRow
// } & HTMLAttributes<HTMLDivElement>;

// /**
//  * @todo handle doc.tags
//  */
// export function SchemaNodeSummary({
//   // signature,
//   isOptional,
//   groupElementClassName,
//   className,
//   headings,
//   apiRefModel,
//   node,
//   ...rest
// }: SchemaNodeSummaryProps) {
//   const { __schema, doc, name } = node;
//   const displayName = name || (__schema === ConstructorSchema.name && 'constructor') || undefined;
//   // const tags = OptionalTag(isOptional);

//   return (
//     <TableRow
//       key={`${__schema}-${name}`}
//       headings={headings}
//       colNumber={4}
//       customRow={{
//         type: (
//           <TypeInfoFromSchemaNode key={`typeinfo-${__schema}-${node.toString()}`} node={node} apiRefModel={apiRefModel} />
//         ),
//       }}
//       row={{
//         name: displayName || '',
//         description: doc?.comment || '',
//         required: !isOptional,
//         type: '',
//       }}
//     />
//   );
//   // return (
//   //   <div {...rest} className={classnames(styles.schemaNodeSummary, className)}>
//   //     {displayName && (
//   //       <div
//   //         id={displayName}
//   //         className={classnames(styles.schemaNodeSummaryName, trackedElementClassName, groupElementClassName)}
//   //       >
//   //         {displayName}
//   //       </div>
//   //     )}
//   //     {showDocs && (
//   //       <div className={classnames(styles.schemaNodeDoc)}>
//   //         {
//   //           <div className={classnames(styles.docComment, !doc?.comment && styles.placeholderComment)}>
//   //             {doc?.comment || 'add comment using JSDoc'}
//   //           </div>
//   //         }
//   //         {tags?.length > 0 && (
//   //           <div className={styles.docTags}>
//   //             {tags.map((tag) => (
//   //               <div key={tag} className={styles.tag}>
//   //                 {tag}
//   //               </div>
//   //             ))}
//   //           </div>
//   //         )}
//   //       </div>
//   //     )}
//   //     {/* {signature && (
//   //       <div key={`node-summary-editor-${signature}-${displayName}`} className={styles.codeEditorContainer}>
//   //         <CodeSnippet>{signature}</CodeSnippet>
//   //       </div>
//   //     )} */}
//   //   </div>
//   // );
// }

// // function OptionalTag(isOptional?: boolean): string[] {
// //   return isOptional ? ['optional'] : [];
// // }
