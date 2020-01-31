# Harmony
Harmony is the engine that drives Bit extensibility and composability.
It's an abstract extension system indended to make any software extendable and composable.

Harmony takes a "micro-kernel" approach and implements the near-minimum amount of software required to build any JavaScript system from independent components through composition.

## Installation
```bash
$ bit install @teambit/harmony
```

## Quick start
```ts
import { Harmony } from 'harmony';
const HelloWorld = {
  name: 'hello-world',
  provider: async () => console.log('hello world!')
};

Harmony.run([HelloWorld]); // echos 'hello world!'
```

## Extension composition

```ts
const Person = {
  name: 'person',
  dependencies: [],
  provider: async () => {
    return () => 'friend!';
  }
};

const HelloThere = {
  name: 'hello-there',
  dependencies: [Person],
  provider: async (name) => console.log(`hello ${name()}!`)
};

Harmony.run([HelloWorld]); // echos 'hello friend!'
```

## Extension configuration

## API reference

## License
Apache License, Version 2.0
