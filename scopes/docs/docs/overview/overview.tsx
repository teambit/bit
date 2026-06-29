/* eslint-disable complexity */
import type { ComponentType } from 'react';
import React, { useContext, useState } from 'react';
import classNames from 'classnames';
import { flatten } from 'lodash';
// import { Icon } from '@teambit/design.elements.icon';
// import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { ComponentContext, useComponentDescriptor } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import type { ComponentPreviewProps } from '@teambit/preview.ui.component-preview';
import {
  ComponentPreview,
  PreviewPropsAggregator,
  SandboxPermissionsAggregator,
} from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview } from '@teambit/component.ui.component-meta';
import { CompositionGallery, CompositionGallerySkeleton } from '@teambit/compositions.panels.composition-gallery';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import type { UsePreviewSandboxSlot } from '@teambit/compositions';
import type { UsePreviewPropsSlot } from '../docs.ui.runtime';
import { ReadmeSkeleton } from './readme-skeleton';
import styles from './overview.module.scss';

export enum BadgePosition {
  Title,
  SubTitle,
  Labels,
  Package,
}

export type TitleBadge = {
  component: ComponentType<any>;
  weight?: number;
  position?: BadgePosition;
};

export type TitleBadgeSlot = SlotRegistry<TitleBadge[]>;

export type OverviewOptions = () => {
  queryParams?: string;
  renderCompositionsFirst?: boolean;
  defaultPkgManager?: 'npm' | 'yarn' | 'pnpm' | 'bit';
};

export type OverviewOptionsSlot = SlotRegistry<OverviewOptions>;

export type OverviewProps = {
  titleBadges: TitleBadgeSlot;
  overviewOptions: OverviewOptionsSlot;
  previewProps?: Partial<ComponentPreviewProps>;
  getEmptyState?: () => ComponentType | undefined;
  TaggedAPI?: React.ComponentType<{ componentId: string }>;
  usePreviewSandboxSlot?: UsePreviewSandboxSlot;
  /**
   * per-component resolvers for iframe attributes on the overview preview (`allow`,
   * `referrerPolicy`, ...). Each resolver gets the current `ComponentModel`; results merge
   * with later registrations winning.
   */
  usePreviewPropsSlot?: UsePreviewPropsSlot;
};

export function Overview({
  titleBadges,
  overviewOptions,
  previewProps,
  getEmptyState,
  TaggedAPI,
  usePreviewSandboxSlot,
  usePreviewPropsSlot,
}: OverviewProps) {
  const component = useContext(ComponentContext);
  const componentDescriptor = useComponentDescriptor();
  const overviewProps = flatten(overviewOptions.values())[0];
  const showHeader = !component.preview?.legacyHeader;
  const EmptyState = getEmptyState && getEmptyState();
  const buildFailed = component.buildStatus?.toLowerCase() !== 'succeed' && component?.host === 'teambit.scope/scope';
  const isScaling = Boolean(component.preview?.isScaling);
  const includesEnvTemplate = Boolean(component.preview?.includesEnvTemplate);
  const defaultLoadingState = React.useMemo(() => {
    return isScaling && !includesEnvTemplate;
  }, [isScaling, includesEnvTemplate]);
  const { isMinimal } = useWorkspaceMode();
  const [isLoading, setLoading] = useState(defaultLoadingState);
  const previewSandboxHooks = usePreviewSandboxSlot?.values() ?? [];
  const previewPropsHooks = usePreviewPropsSlot?.values() ?? [];
  const [sandboxValue, setSandboxValue] = useState('');
  const iframeQueryParams = `onlyOverview=${component.preview?.onlyOverview || 'false'}&skipIncludes=${
    component.preview?.skipIncludes || component.preview?.onlyOverview
  }`;

  const overviewPropsValues = overviewProps && overviewProps();

  const { renderCompositionsFirst, defaultPkgManager } = overviewPropsValues || {};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { onLoad, style, ...rest } = previewProps || {};

  const onPreviewLoad = React.useCallback(
    (e, props) => {
      setLoading(false);
      onLoad?.(e, props);
    },
    [onLoad]
  );

  React.useEffect(() => {
    if (!isLoading && defaultLoadingState) setLoading(true);
    if (isLoading && !defaultLoadingState) setLoading(false);
  }, [component.id.toString(), defaultLoadingState]);

  return (
    <div
      className={classNames(styles.overviewWrapper, isLoading && styles.noOverflow)}
      key={`${component.id.toString()}`}
    >
      <SandboxPermissionsAggregator
        hooks={previewSandboxHooks}
        onSandboxChange={setSandboxValue}
        component={component}
      />
      {showHeader && (
        <ComponentOverview
          className={classNames(styles.componentOverviewBlock, !isScaling && styles.legacyPreview)}
          displayName={component.displayName}
          version={component.version}
          abstract={component.description}
          labels={component.labels}
          packageName={component.packageName}
          titleBadges={flatten(titleBadges.values())}
          componentDescriptor={componentDescriptor}
          component={component}
          pkgManager={defaultPkgManager}
        />
      )}
      {!buildFailed && (
        <div className={styles.readme}>
          {isLoading && (
            <ReadmeSkeleton>
              <CompositionGallerySkeleton compositionsLength={Math.min(component.compositions.length, 3)} />
            </ReadmeSkeleton>
          )}
          <PreviewPropsAggregator hooks={previewPropsHooks} component={component}>
            {(previewAttrs) =>
              !isMinimal && !renderCompositionsFirst ? (
                <>
                  <ComponentPreview
                    {...previewAttrs}
                    onLoad={onPreviewLoad}
                    previewName="overview"
                    pubsub={true}
                    queryParams={[iframeQueryParams, overviewPropsValues?.queryParams || '']}
                    viewport={null}
                    fullContentHeight
                    disableScroll={true}
                    sandbox={sandboxValue}
                    {...rest}
                    component={component}
                    style={{ width: '100%', height: '100%', minHeight: !isScaling ? 500 : undefined }}
                  />
                  {component.preview?.onlyOverview && !isLoading && (
                    <CompositionGallery component={component} sandbox={sandboxValue} />
                  )}
                </>
              ) : (
                <>
                  {component.preview?.onlyOverview && !isLoading && (
                    <CompositionGallery component={component} sandbox={sandboxValue} />
                  )}
                  <ComponentPreview
                    {...previewAttrs}
                    onLoad={onPreviewLoad}
                    previewName="overview"
                    pubsub={true}
                    queryParams={[iframeQueryParams, overviewPropsValues?.queryParams || '']}
                    viewport={null}
                    fullContentHeight
                    disableScroll={true}
                    propagateError={isMinimal}
                    sandbox={sandboxValue}
                    {...rest}
                    component={component}
                    style={{ width: '100%', height: '100%', minHeight: !isScaling ? 500 : undefined }}
                  />
                </>
              )
            }
          </PreviewPropsAggregator>

          {component.preview?.onlyOverview && !isLoading && TaggedAPI && (
            <TaggedAPI componentId={component.id.toString()} />
          )}
        </div>
      )}
      {buildFailed &&
        (EmptyState ? (
          <EmptyState />
        ) : (
          <div className={styles.buildFailed}>
            <BuildStatusMessage buildStatus={component.buildStatus} />
          </div>
        ))}
    </div>
  );
}

// default overview content when the preview can't be shown (e.g. the build failed or is still
// pending). a registered empty state takes precedence over this.
function BuildStatusMessage({ buildStatus }: { buildStatus?: string }) {
  if (buildStatus?.toLowerCase() === 'pending') {
    return (
      <StatusMessageCard status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
  }
  return <StatusMessageCard status="FAILURE" title="failed to get component preview" />;
}
