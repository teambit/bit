import React from 'react';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import type { APIDiffResult, APIDiffChange, APIDiffDetail } from './api-compare.types';
import styles from './api-compare.module.scss';

export type { APIDiffResult, APIDiffChange, APIDiffDetail };

function impactClass(impact: string): string {
  switch (impact) {
    case 'BREAKING':
      return styles.removedBadge;
    case 'NON_BREAKING':
      return styles.addedBadge;
    case 'PATCH':
      return styles.modifiedBadge;
    default:
      return styles.summaryBadge;
  }
}

function impactLabel(impact: string): string {
  switch (impact) {
    case 'BREAKING':
      return 'Breaking';
    case 'NON_BREAKING':
      return 'Non-breaking';
    case 'PATCH':
      return 'Patch';
    default:
      return impact;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'ADDED':
      return styles.statusAdded;
    case 'REMOVED':
      return styles.statusRemoved;
    case 'MODIFIED':
      return styles.statusModified;
    default:
      return styles.statusBadge;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'ADDED':
      return '+ Added';
    case 'REMOVED':
      return '- Removed';
    case 'MODIFIED':
      return '~ Modified';
    default:
      return status;
  }
}

function DetailItem({ detail }: { detail: APIDiffDetail }) {
  const dotClass =
    detail.impact === 'BREAKING'
      ? styles.removedBadge
      : detail.impact === 'NON_BREAKING'
        ? styles.addedBadge
        : styles.modifiedBadge;
  return (
    <li className={styles.detailItem}>
      <span
        className={dotClass}
        style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, marginTop: 6 }}
      />
      <span className={styles.detailDescription}>{detail.description}</span>
    </li>
  );
}

function APIDiffEntry({ change }: { change: APIDiffChange }) {
  const [expanded, setExpanded] = React.useState(change.status === 'MODIFIED');
  const [showSignatures, setShowSignatures] = React.useState(false);

  const hasBody =
    change.status === 'MODIFIED'
      ? (change.changes && change.changes.length > 0) || change.baseSignature || change.compareSignature
      : change.baseSignature || change.compareSignature;

  return (
    <div className={styles.diffEntry}>
      <div
        className={styles.diffEntryHeader}
        onClick={() => hasBody && setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            hasBody && setExpanded(!expanded);
          }
        }}
      >
        <span className={getStatusClass(change.status)}>{getStatusLabel(change.status)}</span>
        <span className={styles.exportName}>{change.exportName}</span>
        <span className={styles.schemaType}>{change.schemaType}</span>
        <span className={impactClass(change.impact)} style={{ fontSize: 10, marginLeft: 'auto' }}>
          {impactLabel(change.impact)}
        </span>
        {hasBody && <span className={expanded ? styles.expandIconOpen : styles.expandIcon}>▶</span>}
      </div>
      {expanded && hasBody && (
        <div className={styles.diffEntryBody}>
          {change.status === 'MODIFIED' && change.changes && change.changes.length > 0 && (
            <ul className={styles.detailsList}>
              {change.changes.map((detail, i) => (
                <DetailItem key={`${detail.changeKind}-${i}`} detail={detail} />
              ))}
            </ul>
          )}
          {change.status === 'MODIFIED' && (change.baseSignature || change.compareSignature) && (
            <>
              <button className={styles.toggleSignatures} onClick={() => setShowSignatures(!showSignatures)}>
                {showSignatures ? '▼ Hide signatures' : '▶ Show signatures'}
              </button>
              {showSignatures && (
                <>
                  {change.baseSignature && (
                    <div>
                      <div className={styles.signatureLabel}>Base</div>
                      <div className={styles.signatureRemoved}>{change.baseSignature}</div>
                    </div>
                  )}
                  {change.compareSignature && (
                    <div>
                      <div className={styles.signatureLabel}>Compare</div>
                      <div className={styles.signatureBlock}>{change.compareSignature}</div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {change.status === 'ADDED' && change.compareSignature && (
            <div className={styles.signatureBlock}>{change.compareSignature}</div>
          )}
          {change.status === 'REMOVED' && change.baseSignature && (
            <div className={styles.signatureRemoved}>{change.baseSignature}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeSection({ title, changes }: { title: string; changes: APIDiffChange[] }) {
  if (changes.length === 0) return null;

  const sorted = [...changes].sort((a, b) => {
    const order: Record<string, number> = { REMOVED: 0, MODIFIED: 1, ADDED: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return (
    <>
      <h3
        style={{
          margin: '16px 0 8px',
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          opacity: 0.6,
        }}
      >
        {title}
      </h3>
      <div className={styles.changeList}>
        {sorted.map((change) => (
          <APIDiffEntry key={`${change.visibility}-${change.status}-${change.exportName}`} change={change} />
        ))}
      </div>
    </>
  );
}

export function APICompare() {
  const compareContext = useComponentCompare();
  const apiDiffResult: APIDiffResult | null | undefined = (compareContext as any)?.apiDiffResult;

  if (apiDiffResult === undefined) {
    return <div className={styles.emptyState}>Loading API diff...</div>;
  }

  if (!apiDiffResult || !apiDiffResult.hasChanges) {
    return <div className={styles.emptyState}>No API changes between these versions</div>;
  }

  const { publicChanges, internalChanges, added, removed, modified, breaking, impact } = apiDiffResult;

  return (
    <div className={styles.apiCompareContainer}>
      <div className={styles.summary}>
        <span className={impactClass(impact)} style={{ fontWeight: 600 }}>
          {impactLabel(impact)}
        </span>
        <span style={{ opacity: 0.4 }}>|</span>
        {added > 0 && <span className={styles.addedBadge}>+{added} added</span>}
        {removed > 0 && <span className={styles.removedBadge}>-{removed} removed</span>}
        {modified > 0 && <span className={styles.modifiedBadge}>~{modified} modified</span>}
        {breaking > 0 && <span className={styles.removedBadge}>{breaking} breaking</span>}
      </div>
      <ChangeSection title="Public API" changes={publicChanges} />
      <ChangeSection title="Internal (non-exported)" changes={internalChanges} />
    </div>
  );
}
