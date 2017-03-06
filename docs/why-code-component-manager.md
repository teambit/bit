
As the world moves to a multi-repository architecture we increasingly need to use the same code components in multiple places again and again. People are re-inventing and duplicating code components already written before on daily basis. 

This wastes precious time and effort which can be better invested in building new things. Components can be improved and evolved without having to start from scratch every time. Duplicating components across repositories isn't any better, as maintaining or changing a single function becomes an odyssey, and the larger the code base the worse it gets. 

Up until Bit, the only way to make components reusable was to spend too much time on boilerplating and build configuration just to end up having to maintain a git repo, a package and CI for every small component. This isn’t practical and is very hard to scale.

To understand the solution we turned back to the basics of writing code, as we were taught from day one. We should create independent and isolated components. We should also manage them to make this a practical practice.

To achieve this we designed Bit - the first code component manager. Bit is a distributed manager written in javascript yet designed to be language agnostic. It allows you to make components reusable with zero initial configuration and use these components across repositories. It also helps to store, organize and manage your components. It allows you to group your components by context, while also handling versioning, dependency management, build and test execution and more. Bit also makes components easy to find and collaborate on.

At the end of the day, distributed component management is deeply connected to the very basics of writing software as we want it to be. Managing code components can help us all to build great things out of smaller building blocks - together. Imagine the possibilities.