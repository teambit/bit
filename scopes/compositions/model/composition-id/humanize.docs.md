---
description: Transforms spaceless composition IDs into readable names with spaces
labels: ['string', 'utility']
---

import { humanizeCompositionId } from './humanize'

```jsx live=true

() => {
    return(
        <>
            <p>{humanizeCompositionId('PrimaryButton')}</p>
            <p>{humanizeCompositionId('primaryButton')}</p>
            <p>{humanizeCompositionId('primary_button')}</p>
            <p>{humanizeCompositionId('primary-button')}</p>
        </>
    )
}
```
