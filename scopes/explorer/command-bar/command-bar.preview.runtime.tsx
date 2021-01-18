import { PreviewRuntime } from '@teambit/preview';
import { PubsubAspect, PubsubPreview } from '@teambit/pubsub';
import { CommandBarAspect } from './command-bar.aspect';
import { KeyEvent } from './model/key-event';

export class CommandBarPreview {
  constructor(private pubSub: PubsubPreview) {
    document.addEventListener('keydown', this.handleKeyEvent);
    document.addEventListener('keypress', this.handleKeyEvent);
    document.addEventListener('keyup', this.handleKeyEvent);
  }

  handleKeyEvent = (e: KeyboardEvent) => {
    this.pubSub.pub(CommandBarAspect.id, new KeyEvent(e))?.catch(() => {});
  };

  static dependencies = [PubsubAspect];
  static runtime = PreviewRuntime;
  static async provider([pubSub]: [PubsubPreview]) {
    const pubsubPreview = new CommandBarPreview(pubSub);
    return pubsubPreview;
  }
}

CommandBarAspect.addRuntime(CommandBarPreview);
