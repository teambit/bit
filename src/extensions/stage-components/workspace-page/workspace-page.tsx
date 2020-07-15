import React, { HTMLAttributes } from 'react';
// import { VersionBlock } from '..//workspace-sections/version-block/version-block';
// import styles from './workspace-page.module.scss';
// import { versionsArray } from '../workspace-page/change-log.data';
// import { DocsSection } from '..//workspace-sections/docs-section';

// const docsMock = {
//   title: 'Radio',
//   subTitle:
//     'Radio Buttons are graphical interface elements that allow user to choose only one of a predefined set of mutually exclusive options.',
//   labels: ['chart', 'graph', 'ui-components', 'react'],
//   installMethods: [
//     { title: 'install package', content: '@google.material-ui/radio' },
//     {
//       title: 'Import from CDN',
//       content: 'https://esm.bit.dev/@google/material-ui/radio/'
//     }
//   ]
// };

export type WorkSpacePageProps = {} & HTMLAttributes<HTMLDivElement>;
/**
 * A full, responsive page, detailing Bit's offering for support.
 * @name WorkSpacePage
 */
// TODO: remove this once use props
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function WorkSpacePage(props: WorkSpacePageProps) {
  return (
    <div>
      {/* <DocsSection {...docsMock} />
      {versionsArray.map((version, index) => (
        <VersionBlock key={index} version={version} className={styles.marginBottom} />
      ))} */}
    </div>
  );
}
