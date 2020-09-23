// import React from 'react';

// import { Icon } from '@teambit/evangelist.elements.icon';
// import classNames from 'classnames';

// import { TestRow } from '@teambit/staged-components.test-row';
// import { Error } from '@teambit/tester';
// import styles from './test-errors.module.scss';

// export type TestErrorsProps = {
//   errors: Error[];
// } & React.HTMLAttributes<HTMLDivElement>;

// export function TestErrors({ errors, className }: TestErrorsProps) {
//   if (errors.length === 0) return null;
//   return (
//     <div className={classNames(className, styles.errorSection)}>
//       <div className={classNames(styles.row, styles.heading)}>
//         <div>Errors</div>
//       </div>
//       {errors.map((error, index) => {
//         const name = error?.file?.split('/').slice(-1)[0];
//         return (
//           <TestRow
//             key={index}
//             rowClass={styles.testRow}
//             content={error.failureMessage}
//             snippetTitle={<SnippetTitle file={error.file} />}
//           >
//             <div className={styles.rowTitle}>
//               <Icon of="warn-circle" />
//               <div>{name}</div>
//             </div>
//             <Icon className={styles.arrow} of="arrow-down" />
//           </TestRow>
//         );
//       })}
//     </div>
//   );
// }

// function SnippetTitle({ file }: { file: string }) {
//   return <div className={styles.errorBlock}>An error occurred at {file}</div>;
// }
