/* eslint-disable react/display-name */
import React, { useContext } from 'react';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { EmptyWorkspace } from '@teambit/workspace.ui.empty-workspace';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';

import { Tooltip } from '@teambit/design.ui.tooltip';
// import { BuildStatus } from '@teambit/dot-components.badges.build-status';
// import { useBuildStatusDisplay } from '@teambit/dot-ripple-ci.ui.display-status';
// import { GradientBackground } from '@teambit/dot-design.surfaces.gradient-background';
import { ComponentID } from '@teambit/component-id';
// import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import { ComponentModel } from '@teambit/component';
import { ComponentCard, ComponentCardPluginType, PluginProps } from '@teambit/explorer.ui.component-card';
import { WorkspaceContext } from '../workspace-context';
import styles from './workspace-overview.module.scss';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const compModelsById = new Map(workspace.components.map((comp) => [comp.id.toString(), comp]));
  const plugins = useCardPlugins({ compModelsById });
  const { components, componentDescriptors } = workspace;
  if (!components || components.length === 0) return <EmptyWorkspace name={workspace.name} />;
  const compDescriptorById = new Map(componentDescriptors.map((comp) => [comp.id.toString(), comp]));
  return (
    <div className={styles.container}>
      <ComponentGrid>
        {components.map((component) => {
          if (component.deprecation?.isDeprecate) return null;
          // return <WorkspaceComponentCard key={index} component={component} />;
          const compDescriptor = compDescriptorById.get(component.id.toString());
          if (!compDescriptor) return null;
          return compDescriptor ? (
            <ComponentCard
              key={component.id.toString()}
              component={compDescriptor}
              plugins={plugins}
              displayOwnerDetails="all"
            />
          ) : null;
        })}
      </ComponentGrid>
    </div>
  );
}

export function useCardPlugins({
  compModelsById,
}: {
  compModelsById: Map<string, ComponentModel>;
}): ComponentCardPluginType<PluginProps>[] {
  const plugins = React.useMemo(
    () => [
      {
        preview: ({ component }) => {
          const compModel = compModelsById.get(component.id.toString());
          if (!compModel) return null;
          return <PreviewPlaceholder componentDescriptor={component} component={compModel} />;
        },
      },
      {
        // previewBottomRight: ({ component }) => {
        //   const buildStatus = component.buildStatus;
        //   // console.log(buildStatus);
        //   return <BuildStatus buildStatus={buildStatus} />;
        // },
        previewBottomRight: ({ component }) => {
          const env = component.get('teambit.envs/envs');
          // const compModel = compModelsById.get(component.id.toString());

          const envComponentId = env?.id ? ComponentID.fromString(env?.id) : undefined;
          // const buildStatus = compModel?.buildStatus;
          // @todo - maybe wire this from cloud
          // const statusDisplay = useBuildStatusDisplay(buildStatus);
          // const background = useGra
          //   // console.log(buildStatus);
          // return ;

          return (
            <div className={styles.rightPreviewPlugins}>
              <div className={styles.badge}>
                <Tooltip delay={300} content={envComponentId?.name}>
                  <img src={env?.icon} className={styles.envIcon} />
                </Tooltip>
              </div>
              {/* <div className={styles.badge}>
                <Tooltip delay={300} content={buildStatus}>
                  <div>
                  <div
      {...rest}
      className={classNames(styles.buildStatus, className)}
      // style={{ backgroundColor: displayStatus.color }}
    >
      <Icon of={displayStatus.icon || ""} />
    </div>
  );
                  </div>
                </Tooltip>
              </div> */}
            </div>
          );
        },

        // previewBottomLeft: ({ component }) => {
        //   const scope: ScopeDescriptor = component.scopeDescriptor;
        //   // return <BuildStatus buildStatus={buildStatus} />;
        //   return (
        //     <Tooltip content={scope.id.toString}>
        //       <ScopeIcon
        //         displayName={scope.id.scopeName}
        //         scopeImage={scope.icon}
        //         bgColor={scope.backgroundIconColor}
        //         size={18}
        //       />
        //     </Tooltip>
        //   );
        // },
      },
      // new LinkPlugin(),
    ],
    []
  );

  return plugins;
}
