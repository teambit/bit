import React, { useContext } from 'react';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { ScopeDetails } from '@teambit/scope.ui.scope-details';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { EmptyScope } from '@teambit/scope.ui.empty-scope';
import { ComponentModel } from '@teambit/component';
import { ScopeContext } from '../scope-context';
import styles from './scope-overview.module.scss';
import type { ScopeBadgeSlot, OverviewLineSlot } from '../../scope.ui.runtime';

export type ScopeOverviewProps = {
  badgeSlot: ScopeBadgeSlot;
  overviewSlot: OverviewLineSlot;
};

export function ScopeOverview({ badgeSlot, overviewSlot }: ScopeOverviewProps) {
  const scope = useContext(ScopeContext);
  const { components } = scope;
  if (!components || components.length === 0) return <EmptyScope name={scope.name} />;

  return (
    <div className={styles.container}>
      <ScopeDetails
        scopeName={scope.name}
        icon={scope.icon}
        badgeSlot={badgeSlot}
        overviewSlot={overviewSlot}
        description={scope.description}
        componentCount={scope.components.length}
      />
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ScopeComponentCard component={component} />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}

type ScopeComponentCardProps = {
  component: ComponentModel;
};

export function ScopeComponentCard({ component }: ScopeComponentCardProps) {
  const shouldShowPreview = component.compositions.length > 0;
  return (
    <ComponentCard
      id={component.id.fullName}
      envIcon={component.environment?.icon}
      description={component.description}
      version={component.version}
      preview={<PreviewPlaceholder component={component} shouldShowPreview={shouldShowPreview} />}
    />
  );
}
