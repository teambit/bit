import { BitBaseEvent } from '@teambit/pubsub';

type ToggleHighlightPayload = {
  shouldHighlight: boolean;
};
export class ToggleHighlightEvent extends BitBaseEvent<ToggleHighlightPayload> {
  static type = `component-highlighter.toggleHighlight`;
  static topic = `component-highlighter`;

  constructor(shouldHighlight: boolean) {
    super(ToggleHighlightEvent.type, '0.0.1', Date.now(), {
      shouldHighlight,
    });
  }
}
