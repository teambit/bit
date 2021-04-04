import { BitBaseEvent } from '@teambit/pubsub';
import { serializeKeyboardEvent } from './serialize-keyboard-event';

export class KeyEvent extends BitBaseEvent<KeyboardEventInit> {
  constructor(event: KeyboardEvent, timestamp = Date.now()) {
    const serialized = serializeKeyboardEvent(event);
    super(event.type, '0.0.1', timestamp, serialized);
  }
}
