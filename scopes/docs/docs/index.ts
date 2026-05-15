import { DocsAspect } from './docs.aspect';

/**
 * Doc entity.
 * @deprecated - please dont use this. use directly from @teambit/docs.entities.doc.
 */
export { Doc, DocProp, DocPropList } from '@teambit/docs.entities.doc';

export type { DocsMain } from './docs.main.runtime';
export type { DocsUI } from './docs.ui.runtime';
export type { DocsPreview, DocsRootProps } from './docs.preview.runtime';
export type { DocReader } from './doc-reader';
export type { Docs, Example } from './docs';
export { defaultDocs } from './docs';

export type { TitleBadgeSlot, TitleBadge, OverviewOptionsSlot, OverviewOptions } from './overview';
// UI value exports removed:
//   - BadgePosition / Overview (was: './overview')
// UI callers should import from './overview' directly.

export { DocsAspect };
export default DocsAspect;
