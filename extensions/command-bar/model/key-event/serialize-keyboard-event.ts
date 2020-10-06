import isPrimitive from 'is-primitive';

export function serializeKeyboardEvent(e: KeyboardEvent): KeyboardEventInit {
  const serialized = {};

  // 'for ... in' includes properties from prototype
  for (let key in e) {
    const val = e[key];
    if (isPrimitive(val)) {
      serialized[key] = val;
    }
  }

  return serialized;
}
