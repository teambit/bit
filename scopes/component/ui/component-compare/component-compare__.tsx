// import React, { useContext, useState, HTMLAttributes, useCallback, useMemo } from 'react';
// import { ComponentContext, ComponentID, ComponentModel } from '@teambit/component';
// import classNames from 'classnames';
// import flatten from 'lodash.flatten';
// import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
// import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
// import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
// import { TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
// import { CodeCompareView } from '@teambit/code.ui.code-compare-view';
// import { useCode } from '@teambit/code.ui.queries.get-component-code';
// import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
// import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
// import { LanesModel, useLanesContext } from '@teambit/lanes.ui.lanes';
// import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
// import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
// import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
// import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
// import { Contributors } from '@teambit/design.ui.contributors';
// // import { SlotRegistry } from '@teambit/harmony';
// import { H2 } from '@teambit/documenter.ui.heading';
// import compact from 'lodash.compact';
// import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
// import { LegacyComponentLog } from '@teambit/legacy-component-log';
// import { ComponentCompareNavSlot } from '@teambit/component-compare';

// import { useComponentCompareParams } from './use-component-compare-params';
// import styles from './component-compare.module.scss';

// // type FileIconSlot = SlotRegistry<FileIconMatch[]>;

// export type ComponentCompareProps = {
//   fileIconSlot?: any;
//   navSlot: ComponentCompareNavSlot;
// } & HTMLAttributes<HTMLDivElement>;

// /*
//   Component Aspect registers the Component Compare Page
//    * version: it is the currently viewed version. Component Context keeps track of this and sets the version
//    *          of the component in the context accordingly.
//    * to: version to compare to, if present auto select it in the dropdown
//    * selected: selected defaults to the first composition of the component, the user
//    *           can change selection between the following drawers;
//    *           compositions, files, aspects, dependencies. (~file/, ~composition/, ~aspects/, ~dependencies/)
//    * * clicking on the compare button computes the compare between the selected versions
//    * note: highlight the compare button when the selection changes
//  */
// export function ComponentCompare({ fileIconSlot, className }: ComponentCompareProps) {
//   const { toVersion, selected: currentFile } = useComponentCompareParams();
//   const component = useContext(ComponentContext);

//   const [showCodeCompare] = useState<boolean>(true);

//   const fromComponentId = component.id;

//   const [currentVersionInfo, lastVersionInfo] = useMemo(() => {
//     return component.logs?.slice().reverse() || [] || [];
//   }, [component.logs]);

//   const toComponentId =
//     (toVersion && component.id.changeVersion(toVersion)) ||
//     (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
//     undefined;

//   const isMobile = useIsMobile();
//   const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
//   const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

//   return (
//     <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.componentCompareContainer, className)}>
//       <Pane className={classNames(styles.left)}>
//         <H2>{component.id.fullName}</H2>
//         <div className={styles.componentCompareVersionSelector}>import { ComponentContext, ComponentID } from '@teambit/component';
// import classNames from 'classnames';
// import React, { useContext, useState, HTMLAttributes } from 'react';
// import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
// import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
// import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
// import { useCode } from '@teambit/code.ui.queries.get-component-code';
// import type { FileIconSlot } from '@teambit/code';
// import { CodeDiffView } from '@teambit/code.ui.code-diff-view';
// import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
// import { useCodeDiffParams } from '@teambit/code.ui.hooks.use-code-diff-params';
// import styles from './code-diff-tab-page.module.scss';

//           <ComponentCompareVersionInfo versionInfo={currentVersionInfo} />
//           <div className={styles.toVersionContainer}>
//             <ComponentCompareVersion component={component} selected={toComponentId.version} />
//           </div>
//         </div>
//         <div className={styles.componentCompareViewerContainer}></div>
//         {showCodeCompare && toComponentId && (
//           <CodeCompareView to={toComponentId} fileName={currentFile} from={fromComponentId} />
//         )}
//       </Pane>
//       <HoverSplitter className={styles.splitter}>
//         <Collapser
//           placement="left"
//           isOpen={isSidebarOpen}
//           onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
//           onClick={() => setSidebarOpenness((x) => !x)}
//           tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} file tree`}
//           className={styles.collapser}
//         />
//       </HoverSplitter>
//       <Pane className={classNames(styles.componentCompareTreeContainer, styles.right)}>
//         <ComponentCompareTree
//           currentFile={currentFile}
//           toComponentId={toComponentId}
//           fromComponentId={fromComponentId}
//           fileIconSlot={fileIconSlot}
//         />
//       </Pane>
//     </SplitPane>
//   );
// }

// export type ComponentCompareVersionProps = {
//   selected?: string;
//   component: ComponentModel;
// } & HTMLAttributes<HTMLDivElement>;

// export function ComponentCompareVersion({ component, selected }: ComponentCompareVersionProps) {
//   const toSnaps = useMemo(() => {
//     const logs = component?.logs;
//     return (logs || [])
//       .filter((log) => !log.tag)
//       .map((snap) => ({ ...snap, version: snap.hash }))
//       .reverse();
//   }, [component?.logs]);

//   const toTags = useMemo(() => {
//     const tagLookup = new Map<string, LegacyComponentLog>();
//     const logs = component?.logs;

//     (logs || [])
//       .filter((log) => log.tag)
//       .forEach((tag) => {
//         tagLookup.set(tag?.tag as string, tag);
//       });
//     return compact(
//       component?.tags
//         ?.toArray()
//         .reverse()
//         .map((tag) => tagLookup.get(tag.version.version))
//     ).map((tag) => ({ ...tag, version: tag.tag as string }));
//   }, [component?.logs]);

//   return (
//     <div className={styles.toVersionContainer}>
//       <VersionDropdown
//         snaps={toSnaps}
//         tags={toTags}
//         currentVersion={selected}
//         overrideVersionHref={(version) => `&?to=${version}`}
//       />
//     </div>
//   );
// }

// export type ComponentCompareVersionInfoProps = {
//   versionInfo?: LegacyComponentLog;
// } & HTMLAttributes<HTMLDivElement>;

// export function ComponentCompareVersionInfo({ className, versionInfo }: ComponentCompareVersionInfoProps) {
//   const { date, message, username, email, tag, hash } = versionInfo || {};
//   const timestamp = useMemo(() => (date ? new Date(parseInt(date)).toString() : new Date().toString()), [date]);
//   if (!versionInfo) return null;

//   const commitMessage =
//     !message || message === '' ? (
//       <div className={styles.emptyMessage}>No commit message</div>
//     ) : (
//       <div className="commitMessage">{message}</div>
//     );
//   const author = {
//     displayName: username,
//     email,
//   };
//   const version = tag ? `v${tag}` : hash;

//   return (
//     <div className={classNames(styles.currentVersionContainer, className)}>
//       <div className="currentVersion">{version}</div>
//       <Contributors contributors={[author || {}]} timestamp={timestamp} />
//       {commitMessage}
//     </div>
//   );
// }
