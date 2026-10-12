# Client checkout transitions in Rust

The checkout transition engine is enabled by `BIT_RUST_CLIENT_VCS=on`. It remains opt-in. It covers checkout target selection, reset of workspace files, revert and checkout used by stash loading. Reset of repository history and untag are separate operations.

The awaited public checkout operation owns one helper lease. Inspection, target selection, merge planning and filesystem persistence share its serialized request broker. Public callbacks run between requests; the broker does not serialize those callbacks or replace component objects. A retired helper is never replaced for the remaining operation. Other object-reading adapters retain their existing boundaries.

Node preserves discovery, imports, missing-component restoration, conflict prompts, removal callbacks, component construction, configuration, installation, build and bitmap updates in their original phases. Those phases may have completed before a later error; checkout is not an atomic repository transaction. Rust selects targets using callback receipts at the original observation boundaries and retains its selection checkpoint rather than replaying callbacks after failure.

Merge preparation validates referenced Versions and Sources before destructive workspace effects. Rust retains target and newly merged bodies in private snapshots. Ordinary file writes reference those snapshots directly instead of returning merged text to Node and sending the same bytes back to the helper. Current-file clones retain canonical Buffer sharing. Cached target bodies also retain their public Buffer aliases; mutation invalidates native provenance.

The writer captures ordinary planned writes before its first asynchronous receipt, including files in later bounded helper frames. Acknowledged writes are not repeated. On helper loss, the remaining default writes use the captured destination, snapshot bytes, EOL conversion and write functions. Custom writers, accessors and unsupported metadata retain canonical behavior. Private snapshots survive helper loss, and escaped public SourceFiles are hydrated before snapshot cleanup.

## Qualification

Qualification is in progress. Production fingerprints, source and compiled tests, actual command parity and whole-command measurements will be recorded after the implementation and harness are frozen. No performance improvement or complete retirement of the TypeScript client VCS is claimed.
