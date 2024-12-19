import React, { useContext, ComponentType, useState } from 'react';
import classNames from 'classnames';
import { flatten } from 'lodash';
// import { Icon } from '@teambit/design.elements.icon';
// import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { ComponentContext, useComponentDescriptor } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { ComponentPreview, ComponentPreviewProps } from '@teambit/preview.ui.component-preview';
// import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview } from '@teambit/component.ui.component-meta';
import { CompositionGallery, CompositionGallerySkeleton } from '@teambit/compositions.panels.composition-gallery';
import { useThemePicker } from '@teambit/base-react.themes.theme-switcher';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
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

export type OverviewOptions = () => { queryParams?: string };

export type OverviewOptionsSlot = SlotRegistry<OverviewOptions>;

export type OverviewProps = {
  titleBadges: TitleBadgeSlot;
  overviewOptions: OverviewOptionsSlot;
  previewProps?: Partial<ComponentPreviewProps>;
  getEmptyState?: () => ComponentType | undefined;
  TaggedAPI?: React.ComponentType<{ componentId: string }>;
};

export function Overview({ titleBadges, overviewOptions, previewProps, getEmptyState, TaggedAPI }: OverviewProps) {
  const component = useContext(ComponentContext);
  const componentDescriptor = useComponentDescriptor();
  const theme = useThemePicker();
  const currentTheme = theme?.current;
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

  const iframeQueryParams = `onlyOverview=${component.preview?.onlyOverview || 'false'}&skipIncludes=${
    component.preview?.skipIncludes || component.preview?.onlyOverview
  }`;

  const overviewPropsValues = overviewProps && overviewProps();

  const themeParams = currentTheme?.themeName ? `theme=${currentTheme?.themeName}` : '';

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
        />
      )}
      {!buildFailed && (
        <div className={styles.readme}>
          {isLoading && (
            <ReadmeSkeleton>
              <CompositionGallerySkeleton compositionsLength={Math.min(component.compositions.length, 3)} />
            </ReadmeSkeleton>
          )}
          {!isMinimal ? (
            <>
              <ComponentPreview
                onLoad={onPreviewLoad}
                previewName="overview"
                pubsub={true}
                queryParams={[iframeQueryParams, themeParams, overviewPropsValues?.queryParams || '']}
                viewport={null}
                fullContentHeight
                disableScroll={true}
                {...rest}
                component={component}
                style={{ width: '100%', height: '100%', minHeight: !isScaling ? 500 : undefined }}
              />
              {component.preview?.onlyOverview && !isLoading && <CompositionGallery component={component} />}
            </>
          ) : (
            <>
              {component.preview?.onlyOverview && !isLoading && <CompositionGallery component={component} />}
              <ComponentPreview
                onLoad={onPreviewLoad}
                previewName="overview"
                pubsub={true}
                queryParams={[iframeQueryParams, themeParams, overviewPropsValues?.queryParams || '']}
                viewport={null}
                fullContentHeight
                disableScroll={true}
                {...rest}
                component={component}
                style={{ width: '100%', height: '100%', minHeight: !isScaling ? 500 : undefined }}
              />
            </>
          )}
          {component.preview?.onlyOverview && !isLoading && TaggedAPI && (
            <TaggedAPI componentId={component.id.toString()} />
          )}
        </div>
      )}
      {buildFailed && EmptyState && <EmptyState />}
    </div>
  );
}
