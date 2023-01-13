import * as uuid from 'uuid';
import { ReviewCommentEvent } from './events';
import { ReviewCommentState, ReviewCommentStatus, ReviewCommentStore } from './models';

export function commentReducer(event: ReviewCommentEvent, state: ReviewCommentStore) {
  const dirtyLineNumbers = new Set<number>();
  const deletedCommentIds = new Set<string>();
  const dirtyCommentIds = new Set<string>();
  const events = (state.events || []).concat([event]);
  const comments = { ...state.comments };

  switch (event.type) {
    case 'edit': {
      if (!event.targetId) break;
      const parent = comments[event.targetId];
      if (!parent) break;

      const edit: ReviewCommentState = {
        comment: {
          ...parent.comment,
          author: event.createdBy,
          dt: event.createdAt,
          text: event.text,
        },
        history: parent.history.concat(parent.comment),
      };

      dirtyLineNumbers.add(edit.comment.lineNumber);
      // console.debug("edit", event);

      comments[event.targetId] = edit;
      break;
    }

    case 'delete': {
      if (!event.targetId) break;
      const selected = comments[event.targetId];
      if (!selected) break;

      delete comments[event.targetId];

      deletedCommentIds.add(selected.comment.id);
      dirtyLineNumbers.add(selected.comment.lineNumber);
      // console.debug("delete", event);
      break;
    }

    case 'create':
      if (!event.id) break;
      if (!comments[event.id]) {
        comments[event.id] = new ReviewCommentState({
          author: event.createdBy,
          dt: event.createdAt,
          id: event.id,
          lineNumber: event.lineNumber,
          selection: event.selection,
          text: event.text,
          parentId: event.targetId,
          status: ReviewCommentStatus.active,
        });
        // console.debug("insert", event);
        dirtyLineNumbers.add(event.lineNumber);
      }
      break;
    default:
      break;
  }

  if (dirtyLineNumbers.size) {
    for (const cs of Object.values(state.comments)) {
      if (dirtyLineNumbers.has(cs.comment.lineNumber)) {
        dirtyCommentIds.add(cs.comment.id);
      }
    }
  }

  return { comments, dirtyCommentIds, deletedCommentIds, events };
}

export function reduceComments(
  actions: ReviewCommentEvent[],
  state: ReviewCommentStore = { comments: {}, events: [] }
) {
  for (const a of actions) {
    if (!a.id) {
      a.id = uuid.v4();
    }
    state = commentReducer(a, state);
  }

  return state;
}
