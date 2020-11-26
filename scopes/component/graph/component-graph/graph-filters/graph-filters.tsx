import { Dependency } from '../../model/dependency';

export function runtimeOnly(edge: Dependency) {
  return edge.type === 'runtime';
}

export function all(/* edge: Dependency */) {
  return true;
}

// export function runtimeOrMine(/* myId: string */) {
//   return (edge: Dependency) => {
//     return edge.type === 'runtime'; // || edge.sourceId === myId;
//   };
// }

export const filters = {
  runtimeOnly,
  all,
};

export type FilterType = keyof typeof filters;
