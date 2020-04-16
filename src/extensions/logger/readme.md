# Logger

A Reusable Logger for bit Extensions.

**Features**

- Write logs to extensions.log
- Provide a log store for logs being created in realtime.
- Play well with legacy logger `via debug.log`

**Usage**

There is one instance of a logger in the system. Use Bit dependency container to consumer the logger.

```typescript
import {Extension} from '@teambit/harmony'
import {Logger} form '../extension/logger'

@Extension()
export class MyExtension {
  constructor(private logger:Logger){}

  api() {
    this.logger.log(this.name, 'start of api call'); // (1)
    this.logger.log(this.name, `end of api call, result is`, someVar);
  }
}
```

**Open Issues**
- Consumer API should not need to provide name.
- Projects is compiler with Babel and extension can't use enum to describe level

**Consumers**
Power the Reporter extension.
