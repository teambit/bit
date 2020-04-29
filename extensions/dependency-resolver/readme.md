Dependency Resolver Extension mostly offer APIs for other extensions.
For example, typescript or css extensions will be extending this extension to support their particular dependency resolution.
It should have a cache mechanism for every file that was resolved. This is critical for performance reasons as resolving dependencies is expensive and components often share same dependencies.

### Responsibilities
## Dependencies Detection
The main responsibility is to find dependencies of a given file. This extension itself doesn't have the knowledge to do so, it delegates the file parsing and AST traversing to other extensions, such as typescript.

## File Resolver
Once the detection is done and the dependencies list is ready, it resolves the path on the filesystem of the dependency. Keep in mind that different extensions may have different resolve strategies, e.g. typescript mostly work with node resolution system whereas css has its own system.

### How To Use
TBD.
