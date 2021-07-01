import { PreviewRuntime } from '@teambit/preview';
import { PubsubAspect, PubsubPreview } from '@teambit/pubsub';
import { isOpenCommandBarKeybinding } from './keybinding';
import { CommandBarAspect } from './command-bar.aspect';
import { KeyEvent } from './model/key-event';

export class CommandBarPreview {
  constructor(private pubSub: PubsubPreview) {
    document.addEventListener('keydown', this.handleKeyEvent);
    document.addEventListener('keypress', this.handleKeyEvent);
    document.addEventListener('keyup', this.handleKeyEvent);
  }

  handleKeyEvent = (e: KeyboardEvent) => {
    const { target } = e;
    if (!target || isEditable(target as HTMLElement)) return;
    if (isDenyListed(e)) e.preventDefault();

    this.pubSub.pub(CommandBarAspect.id, new KeyEvent(e));
  };

  static dependencies = [PubsubAspect];
  static runtime = PreviewRuntime;
  static async provider([pubSub]: [PubsubPreview]) {
    const pubsubPreview = new CommandBarPreview(pubSub);
    return pubsubPreview;
  }
}

const editableTags = ['INPUT', 'SELECT', 'TEXTAREA'];
function isEditable(element: HTMLElement) {
  return editableTags.includes(element.tagName) || element.isContentEditable;
}

CommandBarAspect.addRuntime(CommandBarPreview);

// block default browser behavior that would override our keybinding.
function isDenyListed(e: KeyboardEvent) {
  return isOpenCommandBarKeybinding(e);
}
