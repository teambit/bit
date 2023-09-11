import React, { useContext, ComponentType, useState } from 'react';
import classNames from 'classnames';
import { flatten } from 'lodash';
// import { Icon } from '@teambit/design.elements.icon';
import { PropertiesTable } from '@teambit/react.ui.docs.properties-table';
// import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { ComponentContext, useComponentDescriptor } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { ComponentPreview, ComponentPreviewProps } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview } from '@teambit/component.ui.component-meta';
import { CompositionGallery } from '@teambit/compositions.panels.composition-gallery';
// import { ReadmeSkeleton } from './readme-skeleton';
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
};

export function Overview({ titleBadges, overviewOptions, previewProps }: OverviewProps) {
  const component = useContext(ComponentContext);
  const componentDescriptor = useComponentDescriptor();
  const overviewProps = flatten(overviewOptions.values())[0];
  const showHeader = !component.preview?.legacyHeader;
  const [isLoading, setLoading] = useState(true);

  if (component?.buildStatus === 'pending' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard style={{ margin: 'auto' }} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );

  if (component?.buildStatus === 'failed' && component?.host === 'teambit.scope/scope')
    return <StatusMessageCard style={{ margin: 'auto' }} status="FAILURE" title="failed to get component preview " />;

  const isScaling = component.preview?.isScaling;

  const iframeQueryParams = `skipIncludes=${component.preview?.skipIncludes || 'false'}`;

  const overviewPropsValues = overviewProps && overviewProps();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { onLoad, style, ...rest } = previewProps || {};

  const onPreviewLoad = React.useCallback(
    (e, props) => {
      setLoading(false);
      onLoad?.(e, props);
    },
    [onLoad]
  );

  return (
    <div className={styles.overviewWrapper} key={`${component.id.toString()}`}>
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

      {/* TODO - @oded replace with new panel card same for compositions. */}

      {/* <LinkedHeading size="xs" className={styles.title}>
        <Icon of="text" /> <span>README</span>
      </LinkedHeading> */}
      <div className={styles.readme}>
        {/* {isLoading && <ReadmeSkeleton />} */}
        <ComponentPreview
          onLoad={onPreviewLoad}
          previewName="overview"
          pubsub={true}
          queryParams={[iframeQueryParams, overviewPropsValues?.queryParams || '']}
          viewport={null}
          fullContentHeight
          disableScroll={true}
          {...rest}
          component={component}
          style={{ width: '100%', height: '100%', minHeight: !isScaling ? 500 : undefined }}
        />
        {component.preview?.skipIncludes && <CompositionGallery isLoading={isLoading} component={component} />}
        {component.preview?.skipIncludes && (
          <PropertiesTable className={styles.overviewPropsTable} componentId={component.id.toString()} />
        )}
      </div>
    </div>
  );
}
