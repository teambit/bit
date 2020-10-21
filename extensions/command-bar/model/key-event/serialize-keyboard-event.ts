import isPrimitive from 'is-primitive';

export function serializeKeyboardEvent(e: KeyboardEvent): KeyboardEventInit {
  const serialized = {};

  // 'for ... in' includes properties from prototype (which we want)
  // eslint-disable-next-line no-restricted-syntax, guard-for-in
  for (const key in e) {
    const val = e[key];
    if (isPrimitive(val)) {
      serialized[key] = val;
    }
  }

  return serialized;
}
