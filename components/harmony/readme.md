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
import { Harmony, Extension } from 'harmony';

@Extensioin
class Person {
  sayHello(name = 'world') {
    return `hello ${name}!`;
  }
}

const person = Harmony.load(Person);
helloWorld.sayHello(); // returns 'hello world!'
```

## Component composition

### DI

```ts
class Dude {
  constructor(private person: Person) {}

  sayHello() {
    return this.person.sayHello('dude');
  }
}

Harmony.load([Dude]).sayHello(); // echos 'hello dude!'
```

### Hooks

```ts
@Extension()
class CLI {
  // @hook('command') commands = Hook.create<Command>();
  static command() {
    return Hook.create<Command>();
  }

  run() {
    const allCommands = this.commands.list(); // outputs all hook subscribers
  }
}

@Extension()
class Compiler {
  @command()
  main() {
    return {
      synopsis: 'compile <path>',
      render: () => <Box></Box>,
    };
  }
}
```

## Extension configuration

## Extension metadata

## API reference

## License

Apache License, Version 2.0

Made with ❤ to open software by Team Bit.
