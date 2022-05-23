import React from 'react';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Separator } from '@teambit/design.ui.separator';
import { H1 } from '@teambit/documenter.ui.heading';
import { AlertCard } from '@teambit/design.ui.alert-card';
import { ComponentModel } from '@teambit/component';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { Composition, ComponentComposition } from '@teambit/compositions';
import { EmptyStateSlot } from '@teambit/compositions/compositions.ui.runtime';
import styles from './composition-content.module.scss';


export type CompositionContentProps = {
  component: ComponentModel;
  selected?: Composition;
  queryParams?: string | string[];
  emptyState?: EmptyStateSlot;
};

export function CompositionContent({ component, selected, queryParams, emptyState }: CompositionContentProps) {
  const env = component.environment?.id;
  const EmptyStateTemplate = emptyState?.get(env || ''); // || defaultTemplate;

  if (component.compositions.length === 0 && component.host === 'teambit.workspace/workspace' && EmptyStateTemplate) {
    return (
      <div className={styles.noCompositionsPage}>
        <div>
          <H1 className={styles.title}>Compositions</H1>
          <Separator isPresentational className={styles.separator} />
          <AlertCard
            level="info"
            title="There are no
              compositions for this Component. Learn how to add compositions:"
          >
            <MDXLayout>
              <EmptyStateTemplate />
            </MDXLayout>
          </AlertCard>
        </div>
      </div>
    );
  }

  if (component?.buildStatus === 'pending' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard className={styles.buildStatusMessage} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
  if (component?.buildStatus === 'failed' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard
        className={styles.buildStatusMessage}
        status="FAILURE"
        title="failed to get component preview "
      ></StatusMessageCard>
    );

  // TODO: get the docs domain from the community aspect and pass it here as a prop
  if (component.compositions.length === 0) {
    return (
      <EmptyBox
        title="There are no compositions for this component."
        linkText="Learn how to create compositions"
        link={`https://bit.dev/docs/dev-services-overview/compositions/compositions-overview`}
      />
    );
  }

  return (
    <ComponentComposition
      className={styles.compositionsIframe}
      component={component}
      composition={selected}
      queryParams={queryParams}
    />
  );
}
