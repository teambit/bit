Bit has two main forms of representing a Bit Id.

### BitId instance
Instance of BitId class with clear properties of the scope, name and version.
For example: `BitId { scope: 'my-scope', name: 'my-name', version: '0.0.1 }`.
That's the preferable representation of BitId. Wherever possible, use this format.

### Bit ID string
A string representation of BitId. `BitId.toString()` generates this string.
For example: `my-scope/my-name@0.0.1`.
When an ID is entered by the end user it's always a string.
The problem with the string representation is that since the dynamic-namespace introduced, it's not clear from the string whether an ID has a scope or not.
In the previous example, `my-scope/my-name` could be interpreted as an id with scope (`{ scope: 'my-scope', name: 'my-name' }`) or an id without a scope (`{ scope: null, name: 'my-scope/my-name' }`).
See the next section how to safely parse the string.

## How to transform a Bit ID string to a BitId instance
There are three cases to consider here. Use the strategies by this order.

#### You know whether the ID has a scope
When I add a new component, I know the ID doesn't have a scope name.
On the other hand, when I get exported components on the bare-scope I know the ids have scope names.

Use `BitId.parse(id: BitIdStr, hasScope: boolean = true): BitId`

#### You have a Consumer instance

Use `Consumer.getParsedId(id: BitIdStr): BitId` when you know the ID should be there and to throw an exception when it's not.
Or, use `Consumer.getParsedIdIfExist(id: BitIdStr): BitId | null | undefined` when you're not sure whether the component is there.

#### You have a Scope instance

Use `Scope.getParsedId(id: BitIdStr): Promise<BitId>`.
It's the most expensive call of the three, so use it only when the other two are not options.

