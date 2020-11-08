const macKeySymbols = {
  // modifiers
  shift: '⇧',
  ctrl: '⌃',
  alt: '⎇',
  command: '⌘',
  meta: '⌘',
  mod: '⌘',

  // special keys:
  backspace: '⌫',
  tab: '⇥',
  enter: '↩', // '⌤'
  return: '↩',
  capslock: '⇪',
  esc: '⎋',
  escape: '⎋',
  space: '␣',
  pageup: '⇞',
  pagedown: '⇟',
  end: 'end', // '⤓',
  home: 'home', // '⤒',
  left: '←',
  up: '↑',
  right: '→',
  down: '↓',
  del: '⌦',
  ins: 'insert',
  plus: '+',
};

const winKeySymbols = {
  // modifiers
  shift: 'shift',
  ctrl: 'ctrl',
  alt: 'alt',
  meta: 'win',
  // command: '⌘', // mac only
  mod: 'ctrl',

  // special keys:
  backspace: 'backspace',
  tab: 'tab',
  enter: 'enter',
  return: 'enter',
  capslock: 'caps lock',
  esc: 'Esc',
  escape: 'Esc',
  space: '␣',
  pageup: 'pgUp',
  pagedown: 'pgDown',
  end: 'end',
  home: 'home',
  left: '←',
  up: '↑',
  right: '→',
  down: '↓',
  del: 'del',
  ins: 'insert',
  plus: '+',
};

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const keySymbols = isMac ? macKeySymbols : winKeySymbols;

/*
  // reference:
  ⎋ Escape
  ⇥ Tab forward
  ⇤ Tab back
  ⇪ Capslock
  ⇧ Shift
  ⌃ Control(this is the one you are looking for)
  ⌥ Option (Alt, Alternative)
  ⌘ Command
  ␣ Space
  ⏎ Return
  ↩ Return
  ⌫ Delete back
  ⌦ Delete forward
  ⇱ Home
  ↖ Home
  ↸ Home
  ⇲ End
  ↘ End
  ⇞ Pageup
  ⇟ Pagedown
  ↑ Up arrow
  ⇡ Up arrow
  ↓ Down arrow
  ⇣ Down arrow
  ← Left arrow
  ⇠ Left arrow
  → Right arrow
  ⇢ Right arrow
  ⌧ Clear
  ⇭ Numberlock
  ⌤ Enter
  ⏏ Eject
  ⌽ Power
*/
