import { BitBaseEvent } from '@teambit/pubsub';
import { CompositionsAspect } from './compositions.aspect';

type ToggleHighlightPayload = {
  shouldHighlight: boolean;
};
export class ToggleHighlightEvent extends BitBaseEvent<ToggleHighlightPayload> {
  static type = `${CompositionsAspect.id}.toggleHighlight`;
  static topic = `${CompositionsAspect.id}.highlighter`;

  constructor(shouldHighlight: boolean) {
    super(ToggleHighlightEvent.type, '0.0.1', Date.now(), {
      shouldHighlight,
    });
  }
}
