import React from 'react';
// import { useTheme } from "@teambit/design.themes.base-theme";
import classNames from 'classnames';
import { Link } from '@teambit/base-react.navigation.link';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { LaneId } from '@teambit/lane-id';
import { Doc } from '@teambit/docs.entities.doc';
import { PreviewContainer, ComponentDetails, Card } from './sections';
import { BottomPlugins, TopPlugins } from './sections/plugins/plugins';
import type { ComponentCardPluginType, PluginProps } from './sections/plugins/plugins';
import { defaultPlugins, ScopeIdentifier } from './default-plugins';
import styles from './component-card.module.scss';
// import { hexToRGB } from "@teambit/design.utils.hex-to-rgb";

export type ComponentCardProps = {
  /**
   * component descriptor data
   */
  component: ComponentDescriptor;

  /**
   * An array of plugins to be used in the card.
   */
  plugins?: ComponentCardPluginType<PluginProps>[];

  /**
   * override card styles
   */
  className?: string;

  scope?: ScopeIdentifier;

  laneId?: LaneId;

  /**
   * the type of owner details to be displayed in the breadcrumbs. defaults to none.
   */
  displayOwnerDetails?: 'all' | 'none';
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentCard({
  component,
  laneId,
  scope,
  plugins = defaultPlugins,
  displayOwnerDetails,
  className,
  ...rest
}: ComponentCardProps) {
  // const theme = useTheme();
  if (!component) return null;
  const Preview = plugins
    ?.map((plugin) => plugin.preview)
    ?.filter((x) => !!x)
    ?.pop(); // get the last preview from plugins

  const PreviewBottomLeftPlugin = plugins
    ?.map((plugin) => plugin.previewBottomLeft)
    ?.filter((x) => !!x)
    ?.pop(); // get the last preview from plugins

  const PreviewBottomRightPlugin = plugins
    ?.map((plugin) => plugin.previewBottomRight)
    ?.filter((x) => !!x)
    ?.pop(); // get the last preview from plugins

  // TODO - replace with the Doc class methods. they are not working at the moment @guy.
  const description = getDescription(component);
  // const backgroundColor = hexToRGB(theme.surfaceColor, 0.1);

  return (
    <LinkWrapper componentDescriptor={component} plugins={plugins as any} laneId={laneId}>
      <Card {...rest} className={classNames(styles.cardWrapper, className)}>
        <TopPlugins component={component} plugins={plugins} />
        <PreviewContainer
          preview={Preview && <Preview component={component} />}
          component={component}
          PreviewBottomRightPlugin={PreviewBottomRightPlugin}
          PreviewBottomLeftPlugin={PreviewBottomLeftPlugin}
        />
        {/* <div className={styles.componentDetails} style={{ backgroundColor }}> */}
        <div className={styles.componentDetails}>
          <ComponentDetails
            scope={scope}
            componentId={component.id as any}
            component={component}
            description={description}
            displayOwnerDetails={displayOwnerDetails}
          />
          <BottomPlugins component={component} plugins={plugins} />
        </div>
      </Card>
    </LinkWrapper>
  );
}

type LinkWrapperProps = {
  children: React.ReactElement;
  laneId?: LaneId;
  componentDescriptor: ComponentDescriptor;
  plugins: ComponentCardPluginType<PluginProps>[];
};

function LinkWrapper({ children, componentDescriptor, laneId, plugins }: LinkWrapperProps) {
  const link = plugins
    ?.map((plugin) => plugin.link)
    ?.filter((x) => !!x)
    ?.pop(); // get the last link from plugins

  const descriptorLink = link?.(componentDescriptor.id as any, laneId);
  if (descriptorLink) {
    return (
      <Link external={descriptorLink.startsWith('http')} href={descriptorLink} className={styles.linkWrapper}>
        {children}
      </Link>
    );
  }
  return children;
}

// @hack for now. should be replaced
function getDescription(component?: ComponentDescriptor): string | undefined {
  if (!component) return undefined;

  // what can I use here instead of `Descriptor`? the card cant use symphony components
  const docAspect = component.get<any>('teambit.docs/docs');
  const { filePath, props } = docAspect?.data?.doc || {};
  const docData = new Doc(filePath, props);

  // @ts-ignore
  const descriptionData = docData?.props?.find((x) => x.name === 'description');

  return descriptionData?.value;
}
