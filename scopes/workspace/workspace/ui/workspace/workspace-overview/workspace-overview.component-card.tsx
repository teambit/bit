// import React from 'react';
// import { ComponentDescriptor } from '@teambit/component-descriptor';
// import { LaneId } from '@teambit/lane-id';
// import { ScopeID } from '@teambit/scopes.scope-id';
// import { ComponentCard, ComponentCardPluginType, PluginProps } from '@teambit/explorer.ui.component-card';
// import { ComponentModel } from '@teambit/component';
// import { LoadPreview } from '@teambit/workspace.ui.load-preview';

// import styles from './workspace-overview.module.scss';

// export type WorkspaceComponentCardProps = {
//     component: ComponentModel;
//     componentDescriptor: ComponentDescriptor;
//     plugins?: ComponentCardPluginType<PluginProps>[];
//     scope?: {
//         icon?: string;
//         backgroundIconColor?: string;
//         id: ScopeID;
//     };
//     className?: string;
//     laneId?: LaneId;
//     displayOwnerDetails?: "all" | "none";
// } & React.HTMLAttributes<HTMLDivElement>;

// export function WorkspaceComponentCard({
//     component,
//     componentDescriptor,
//     scope,
//     plugins,
// }: WorkspaceComponentCardProps) {
//     const [shouldShowPreviewState, togglePreview] = React.useState<boolean>(false);
//     if (component.deprecation?.isDeprecate) return null;
//     const showPreview = (e: React.MouseEvent<HTMLDivElement>) => {
//         e.stopPropagation();
//         if (!shouldShowPreviewState) {
//             togglePreview(true);
//         }
//     };
//     const loadPreviewBtnVisible = component.compositions.length > 0 && !shouldShowPreviewState;
//     const updatedPlugins = React.useMemo(() => {
//         return plugins?.map((plugin) => {
//             if (plugin.preview) {
//                 const Preview = plugin.preview;
//                 return {
//                     ...plugin,
//                     preview: function PreviewWrapper(props) {
//                         return (
//                             <div className={styles.previewWrapper}>
//                                 <Preview {...props} shouldShowPreview={shouldShowPreviewState} />
//                             </div>
//                         )
//                     }
//                 }
//             }
//             return plugin;
//         })
//     }, [shouldShowPreviewState, component.compositions.length]);

//     return (
//         <div
//             key={component.id.toString()}
//             className={styles.cardWrapper}
//         >
//             {loadPreviewBtnVisible && <LoadPreview
//                 className={styles.loadPreview}
//                 onClick={showPreview}
//             />}
//             <ComponentCard
//                 component={componentDescriptor}
//                 plugins={updatedPlugins}
//                 displayOwnerDetails="all"
//                 scope={scope}
//             />
//         </div>
//     )
// }
