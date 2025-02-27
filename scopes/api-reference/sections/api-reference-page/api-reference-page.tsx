import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import flatten from 'lodash.flatten';
import classNames from 'classnames';
import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { Link as BaseLink } from '@teambit/base-react.navigation.link';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useAPI } from '@teambit/api-reference.hooks.use-api';
import { APIReferenceExplorer } from '@teambit/api-reference.explorer.api-reference-explorer';
import { useAPIRefParam } from '@teambit/api-reference.hooks.use-api-ref-url';
import { APINodeRendererSlot } from '@teambit/api-reference';
import { sortAPINodes } from '@teambit/api-reference.utils.sort-api-nodes';
import { TreeNode } from '@teambit/design.ui.tree';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './api-reference-page.module.scss';

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

export type APIRefPageProps = {
  host: string;
  rendererSlot: APINodeRendererSlot;
} & HTMLAttributes<HTMLDivElement>;

export function APIRefPage({ rendererSlot, className }: APIRefPageProps) {
  const component = useContext(ComponentContext);
  const lanes = useLanes();
  const renderers = flatten(rendererSlot.values());
  const { apiModel, loading } = useAPI(component.id.toString(), renderers);
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const selectedAPIFromUrl = useAPIRefParam('selectedAPI');

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedAPIFromUrl]);

  const apiNodes = (apiModel && flatten(Array.from(apiModel.apiByType.values())).sort(sortAPINodes)) || [];

  const isEmpty = apiNodes.length === 0;

  const apiTree: string[] = useMemo(() => {
    return apiNodes.map((apiNode) => {
      if (!apiNode.exported) return `_Internals/${apiModel?.internalAPIKey(apiNode.api)}`;
      return `${apiNode.renderer?.nodeType}/${apiNode.alias || apiNode.api.name}`;
    });
  }, [apiNodes.length]);

  const getIcon = (node: TreeNode) => {
    const nodeType = node.id.split('/')[0];
    if(nodeType === '_Internals') {
      const apiNode = apiModel?.apiByName.get(node.id.replace('_Internals/', ''));
      const icon = apiNode?.renderer.icon?.url;
      return icon || undefined;
    }
    const icon = apiModel?.apiByType.get(nodeType)?.[0].renderer.icon?.url;
    return icon || undefined;
  };

  const selectedAPINode =
    (selectedAPIFromUrl &&
      (apiModel?.apiByName.get(selectedAPIFromUrl) ||
        apiModel?.apiByName.get(selectedAPIFromUrl.replace('_Internals/', '')))) ||
    apiNodes[0];

  const selectedAPIName =
    (selectedAPINode && selectedAPINode.exported
      ? `${selectedAPINode?.renderer?.nodeType}/${selectedAPINode?.alias || selectedAPINode?.api.name}`
      : selectedAPINode && `_Internals/${apiModel?.internalAPIKey(selectedAPINode.api)}`) || apiTree[0];

  const SelectedAPIComponent = selectedAPINode && selectedAPINode.renderer.Component;
  const query = useQuery();

  if (loading) {
    return (
      <div className={styles.loader}>
        <RoundLoader />
      </div>
    );
  }

  if (!apiModel || isEmpty) {
    return <EmptyBox title={'There is no API extracted for this component.'} link={''} linkText={''} />;
  }
  const icon = selectedAPINode.renderer.icon;
  const name = selectedAPINode.api.name;
  const componentVersionFromUrl = query.get('version');
  const filePath = selectedAPINode.api.location.filePath;

  const pathname = ComponentUrl.toUrl(component.id, { includeVersion: false, useLocationOrigin: true });
  const componentUrlWithoutVersion = pathname?.split('~')[0];

  const viewedLaneId = lanes.lanesModel?.viewedLane?.id;
  const laneComponentUrl =
    viewedLaneId && !viewedLaneId.isDefault() && mounted
      ? `${window.location.origin}${LanesModel.getLaneComponentUrl(component.id, viewedLaneId)}/~code/${filePath}${
          componentVersionFromUrl ? `?version=${componentVersionFromUrl}` : ''
        }`
      : undefined;

  const mainComponentUrl = `${componentUrlWithoutVersion}/~code/${filePath}${
    componentVersionFromUrl ? `?version=${componentVersionFromUrl}` : ''
  }`;

  const locationUrl = laneComponentUrl || mainComponentUrl;

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(className, styles.apiRefPageContainer)}>
      <Pane className={styles.left}>
        <div className={styles.selectedAPIDetailsContainer}>
          <div className={styles.apiNodeDetailsNameContainer}>
            {icon && (
              <div className={styles.apiTypeIcon}>
                <img src={icon.url} />
              </div>
            )}
            <H1 size={'md'} className={styles.name}>
              {name}
            </H1>
            <SelectedAPILocation locationUrl={locationUrl} />
          </div>
          {SelectedAPIComponent && (
            <SelectedAPIComponent apiNode={selectedAPINode} apiRefModel={apiModel} renderers={renderers} depth={0} />
          )}
        </div>
      </Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          placement="left"
          isOpen={isSidebarOpen}
          onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
          onClick={() => setSidebarOpenness((x) => !x)}
          tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} file tree`}
          className={styles.collapser}
        />
      </HoverSplitter>
      <Pane className={classNames(styles.right, styles.dark)}>
        <APIReferenceExplorer selectedAPIName={selectedAPIName} apiTree={apiTree} getIcon={getIcon} />
      </Pane>
    </SplitPane>
  );
}

function SelectedAPILocation({ locationUrl }: { locationUrl: string }) {
  return (
    <Link external={true} href={locationUrl} className={styles.locationLink}>
      <div className={styles.locationLabel}>View Code</div>
      <div className={styles.locationIcon}>
        <img src="https://static.bit.dev/design-system-assets/Icons/external-link.svg"></img>
      </div>
    </Link>
  );
}
