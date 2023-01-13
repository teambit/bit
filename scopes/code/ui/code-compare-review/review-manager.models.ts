import { ReviewCommentEvent } from './events';
import { ReviewCommentRenderState, ReviewCommentState } from './models';

export interface ReviewCommentIterItem {
  depth: number;
  state: ReviewCommentState;
}

export interface OnActionsChanged {
  (actions: ReviewCommentEvent[]): void;
}

export const defaultStyles: Record<string, {}> = {
  reviewComment: {
    'font-family': `font-family: Monaco, Menlo, Consolas, "Droid Sans Mono", "Inconsolata",
    "Courier New", monospace;`,
    'font-size': '12px',
  },
  'reviewComment.dt': {},
  'reviewComment.active': { border: '1px solid darkorange' },
  'reviewComment.inactive': {},
  'reviewComment.author': {},
  'reviewComment.text': {},
  reviewCommentEditor: {
    padding: '5px',
    border: '1px solid blue',
    'margin-left': '1px',
    'box-shadow': ' 0px 0px 4px 2px lightblue',
    'font-family': 'font-family: Monaco, Menlo, Consolas, "Droid Sans Mono", "Inconsolata"',
  },
  'reviewCommentEditor.save': { width: '150px' },
  'reviewCommentEditor.cancel': { width: '150px' },
  'reviewCommentEditor.text': { width: 'calc(100% - 5px)', resize: 'none' },
  editButtonsContainer: { cursor: 'pointer', fontSize: '12px' },
  'editButton.add': {},
  'editButton.remove': {},
  'editButton.edit': {},
};

export interface ReviewManagerConfig {
  commentIndent?: number;
  commentIndentOffset?: number;
  editButtonAddText?: string;
  editButtonEnableRemove?: boolean;
  editButtonOffset?: string;
  editButtonRemoveText?: string;
  formatDate?: { (dt: Date): string };
  readOnly?: boolean;
  reviewCommentIconActive?: string;
  reviewCommentIconSelect?: string;
  showInRuler?: boolean;
  renderComment?(isActive: boolean, comment: ReviewCommentIterItem): HTMLElement;
  styles?: Record<string, {}>;
  setClassNames?: boolean;
  verticalOffset?: number;
}

export interface ReviewManagerConfigPrivate {
  commentIndent: number;
  commentIndentOffset: number;
  editButtonAddText: string;
  editButtonEditText: string;
  editButtonEnableEdit: boolean;
  editButtonEnableRemove: boolean;
  editButtonOffset: string;
  editButtonRemoveText: string;
  formatDate?: { (dt: Date): string };
  readOnly: boolean;
  rulerMarkerColor: any;
  rulerMarkerDarkColor: any;
  showAddCommentGlyph: boolean;
  showInRuler: boolean;
  renderComment?(isActive: boolean, comment: ReviewCommentIterItem): HTMLElement;
  styles: Record<string, {}>;
  setClassNames: boolean;
  verticalOffset: number;
}

export const defaultReviewManagerConfig: ReviewManagerConfigPrivate = {
  commentIndent: 20,
  commentIndentOffset: 20,
  editButtonAddText: 'Reply',
  editButtonEditText: 'Edit',
  editButtonEnableEdit: true,
  editButtonEnableRemove: true,
  editButtonOffset: '-10px',
  editButtonRemoveText: 'Remove',
  formatDate: undefined,
  readOnly: false,
  rulerMarkerColor: 'darkorange',
  rulerMarkerDarkColor: 'darkorange',
  showAddCommentGlyph: true,
  showInRuler: true,
  styles: { ...defaultStyles },
  setClassNames: true,
  verticalOffset: 0,
};

export const CONTROL_ATTR_NAME = 'ReviewManagerControl';
export const POSITION_BELOW = 2; // above=1, below=2, exact=0
// const POSITION_EXACT = 0;

export interface EditorElements {
  cancel: HTMLButtonElement;
  confirm: HTMLButtonElement;
  root: HTMLSpanElement;
  textarea: HTMLTextAreaElement;
}

export interface InlineToolbarElements {
  add: HTMLSpanElement;
  edit: HTMLSpanElement;
  remove: HTMLSpanElement;
  root: HTMLDivElement;
}
export interface RenderStoreItem {
  viewZoneId?: string;
  renderStatus?: ReviewCommentRenderState;
}
