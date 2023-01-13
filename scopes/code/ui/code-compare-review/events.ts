// @todo clean up
// export type ReviewEventType = 'CREATE' | 'EDIT' | 'DELETE';
import { CodeSelection } from './models';

export type CommonFields = {
  id: string;
  targetId?: string;
  createdBy: string;
  createdAt: number;
};

export type CreateCommentEvent = {
  type: 'create';
  lineNumber: number;
  text: string;
  selection?: CodeSelection;
} & CommonFields;

export type EditCommentEvent = {
  type: 'edit';
  text: string;
} & CommonFields;

export type DeleteCommentEvent = { type: 'delete' } & CommonFields;

export type ReviewCommentEvent = CreateCommentEvent | EditCommentEvent | DeleteCommentEvent;
