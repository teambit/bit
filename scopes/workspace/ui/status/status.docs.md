---
labels: ['workspace', 'job', 'status']
description: 'Show job status'
---

import { Status, JobStatus } from './status';

Status example:

```js live
<div>
  <Status status={JobStatus.fail} />
  <Status status={JobStatus.pass} />
  <Status status={JobStatus.running} />
  <Status status={JobStatus.pending} />
</div>
```
