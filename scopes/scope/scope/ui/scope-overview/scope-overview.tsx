import React, { useContext } from 'react';
import { ComponentCard } from '@teambit/ui.gallery.component-card';
import { ComponentGrid } from '@teambit/ui.gallery.component-grid';
import { ScopeDetails } from '@teambit/ui.scope-details';
import { PreviewPlaceholder } from '@teambit/ui.preview-placeholder';
import { EmptyScope } from '@teambit/ui.empty-scope';
import { ComponentModel } from '@teambit/component';
import { ScopeContext } from '../scope-context';
import styles from './scope-overview.module.scss';
import { ScopeBadgeSlot } from '../../scope.ui.runtime';

export type ScopeOverviewProps = {
  badgeSlot: ScopeBadgeSlot;
};

export function ScopeOverview({ badgeSlot }: ScopeOverviewProps) {
  const scope = useContext(ScopeContext);
  const { components } = scope;
  if (!components || components.length === 0) return <EmptyScope name={scope.name} />;
  return (
    <div className={styles.container}>
      <ScopeDetails
        scopeName={scope.name}
        icon={scope.icon}
        badgeSlot={badgeSlot} // visibility should be extended by a slot registered by bit.dev
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
      preview={<PreviewPlaceholder component={component} shouldShowPreview={shouldShowPreview} />}
    />
  );
}
