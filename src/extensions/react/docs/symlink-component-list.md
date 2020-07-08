# IMPORTANT - DELETE THIS FILE WHEN COMPONENTS ARE EXPORTED.

To get the UI working we need to link some components from "react-new-project" repo.
`cd` to this (Bit) repository's root directory and run the following command.
```sh
$ cd {path to react-new-project repo}
$ bd link
$ cd {path to bit repo}
$ ln -s {path-to-react-new-project}/node_modules/@bit/bit.test-scope.* ./node_modules/@bit
```

***or change imports in `base.tsx` to local clone of react-new-project***
