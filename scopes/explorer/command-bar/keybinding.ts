export const openCommandBarKeybinding = 'mod+k';
export const isOpenCommandBarKeybinding = (e: KeyboardEvent) => {
  // TODO - use a keybinding matcher.
  return (e.ctrlKey || e.metaKey) && e.key === 'k';
};
