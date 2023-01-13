import { ReviewCommentEvent } from './events';

export interface ReviewCommentStore {
  comments: Record<string, ReviewCommentState>;
  deletedCommentIds?: Set<string>;
  dirtyCommentIds?: Set<string>;
  events?: ReviewCommentEvent[];
}

export class ReviewCommentState {
  comment: ReviewComment;
  history: ReviewComment[];

  constructor(comment: ReviewComment) {
    this.comment = comment;
    this.history = [comment];
  }
}

export type ReviewComment = {
  id: string;
  parentId?: string;
  author: string;
  dt: number;
  lineNumber: number;
  text: string;
  selection?: CodeSelection;
  status: ReviewCommentStatus;
};

export enum ReviewCommentRenderState {
  dirty = 1,
  hidden = 2,
  normal = 3,
}

export type CodeSelection = {
  startColumn: number;
  endColumn: number;
  startLineNumber: number;
  endLineNumber: number;
};

export enum ReviewCommentStatus {
  active = 1,
  deleted = 2,
  edit = 3,
}

export enum NavigationDirection {
  next = 1,
  prev = 2,
}

export enum EditorMode {
  insertComment = 1,
  replyComment = 2,
  editComment = 3,
  toolbar = 4,
}
