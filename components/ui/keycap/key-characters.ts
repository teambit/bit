import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';

const macKeySymbols = {
  // modifiers
  shift: '⇧',
  ctrl: '⌃',
  alt: '⌥',
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

const macRegex = /Mac|iPod|iPhone|iPad/;
export function prettifyKey(key: string | any) {
  if (typeof key !== 'string') return key;

  // consider using getLocation() from routing
  const isMac = !isBrowser || macRegex.test(window.navigator.platform);
  const lib = isMac ? macKeySymbols : winKeySymbols;

  return key in lib ? lib[key] : key;
}

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
