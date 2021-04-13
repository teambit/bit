### Scope

Scope stores the components and their metadata compressed in the filesystem as "object". A scope can be local, along side the workspace, saved in `.git/bit`/`.bit` directory. Or it can be on a remote, which gets created by `bit init --bare`.

To push/pull objects from the remote, use `bit export`, `bit import` and `bit fetch`. To see the list of the components in the scope, use `bit list` or the low-level `bit cat-scope` commands.

When importing components to a scope, normally, Bit brings all its flattened-dependencies, which is the direct dependencies and their dependencies recursively. Also, during the export process, once a component is pushed to a remote, Bit imports all the missing flattened dependencies of that component. This protects the user in case one of the indirect dependency got deleted or its scope is down (the historic "pad-left" case).

### Objects

- `Component` - has the main data about the component, such as, name, scope-name, head-hash and a list of tags:hashes.
- `Version` - represents a snap. has the source file hashes, dependencies data, build data, etc.
- `Source` - source-file/dist-file
- `Lane` - component ids and their heads of the lane

### Export Process

The main challenge in the export process is to keep the scopes consistent when exporting to multiple scopes. a user can export components belong to different scopes with cycle dependencies between them. For example. scopeA/compA depends on scopeB/compB that depends on scopeA/compA. If we persist the data of scopeA/compA but fail during the persist of scopeB/compA, users that import compA will get the an invalid component as its dependency compB is missing.

Since Bit is distributed, there is no central place to make the persist of all scopes at once. It requires some extra steps to ensure the data integrity.

The following steps are executed during the export:

1. data transfer - the components are exported to the different scopes and stored in a temporarily directory `pending-object/<export-id>` on the remote. This is a non-blocking step, meaning, multiple clients can enter to this steps simultaneously.
2. validation - validate that the objects can be merged with no errors such as merge-conflict or component-needs-update. This is where the 'lock' starts. if there are multiple export-ids, only the first one is allowed to enter this step, the rest get an `ServerIsBusy` exception. The reason for locking is that if two clients export at the same time and validate at the same time on the same component, since they validate against the stored component, both can succeed but after saving one of them, the other would get a conflict error during the persist, which we want to avoid at all cost. In case anything goes wrong in this step, the pending-object of this export-id is deleted for all scopes to release the resources.
3. persist - load the data from pending-objects and save them in the objects, the components and lanes are merged carefully to not loose any local data. If the persist of a scope completed successfully, it deletes the pending-object dir to free the resource.
   If it failed, the pending-objects are not deleted, so no other export could push data until this export completes. To be able to resume this failed persist, the user can re-run the export with `--resume <export-id>` flag. To make sure the scopes are not locked forever in case the user who ran the export is not available, a command `bit resume-export <export-id> <remotes...>` can be running outside of the original workspace.
4. import-missing-dependencies - as described above in the "scope" section, this is to make sure the remote scope has all flattened-dependencies of the exported components. In case there is an error in this step, the process continues and the export is not cancelled.

Once all steps are completed, Bit updates the .bitmap file with the new versions and the objects if needed.
The data transferred to the server is minimal, since Bit saves the locally tagged/snapped hashes, it knows to export only those. To override this and export all tags/snaps of a component, use `--all-versions` flag.

### Import Process

TBD. See https://github.com/teambit/bit/pull/3656 for new changes here.
