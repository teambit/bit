# Stable local graph command JSON

The cold command benchmark recorded two legacy `graph --json` results with 334 nodes and 2,159 edges. Their first difference was edge position 198; their node/edge contents were semantically equal. See [the recorded blocker](command-benchmark-graph-blocker.json). This is an output-order problem independent of native extraction.

`GraphIdsFromFsBuilder` inserts direct edges in `getComponentDependencies()` order and merges saved dependency subgraphs. `GraphBuilder.getGraphIds()` preserves those arrays when constructing `ComponentIdGraph`. Cleargraph's `toJson()` iterates its `nodeMap` and `edgeMap` insertion order. Consequently equivalent discovery sequences can produce different array order at the command boundary. These observations identify how discovery order reaches JSON; they do not identify a single asynchronous detector as the cause of the recorded legacy variation.

`GraphCmd.json()` now orders local output node IDs and edges by their string IDs. Comparisons use ordinal string order rather than locale-dependent collation. Cleargraph edge IDs uniquely identify source/target pairs. Sorting copies the serialized edge array and does not change discovery order, stored dependencies, graph traversal, or graph construction. The existing node-ID projection and local-only filtering remain in place. Every edge field, including dependency type and bidirectionality, is retained.

Remote JSON uses graphlib's different schema, including options, labels, compound graph parents, and named multigraph edges. It remains unchanged; the recorded blocker concerns the local command.

`scopes/component/graph/graph-cmd.spec.ts` covers this at the component level and runs with `bit test`. It executes the actual `GraphCmd` and cleargraph with a fixture host and checks that shuffled discovery order produces identical bytes, full edge data, unchanged internal graph serialization, local-only membership, explicit component resolution, and the remote graphlib contract.

The benchmark must continue comparing whole command JSON directly. It must not sort or normalize captured output to pass parity; ordering belongs to the production command boundary.
