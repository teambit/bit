The goal for this branch is to try to bundle bit cli using esbuild.
you should look at the branch called "bit-bundle2". there is a lot of work done there. so start from there. but you don't have to use all or even any of the code there. you can start from scratch if you want, but it is better to start from that branch and see what was done there and what can be reused.
do not merged that branch into the current branch. take only relevant parts from it.
but you should be aware that the branch is not working yet, and it is not finished. it is a work in progress.
Also that branch was done long time ago so all the dependencies are outdated and need to be updated to the latest versions. (for example esbuild)
Another important note: the current branch - bit-bundle3 is based on the "remove-core-envs-from-manifest" branch. which remove the core envs from the repo. the core envs are what contained many of the problematic deps that are excluded or ignored by esbuild in bit-bundle2. so you might remove many of the code and custom esbuild plugins that were added in bit-bundle2 to handle those core envs. you should check the code and see if it is still needed or not.
also there is a process of pre-bundle the preview and ui runtimes in the repo. this happen during build. there is also a process of running that bundle again when using --dev flag on "bit start" command. I don't care that flag will only work for devs using the repo directly and not the bundled version of bit. as most regular users will never use that flag.
this should also simply things but not require rspack/webpack stuff in the bundle.
Also another matter you should check is that - when running bit install on any bit workspace, we have a process that link core aspects (everything in the manifest) to the node_modules. so they are availalbe automatically to use. once we do a bundle we should probably need a way to create some barrel files that mimic this exports stuff and re-export them from the bundle. so users can use the core aspects. just run "bit install" on any bit workspace and you can see them in the "node_modules/@teambit" (you can use the bvm version (aka bit command) instead of installing with this repo - bd command) in case you want to see how it works.
your goal is to create a bundle and then test it on a workspace.
start with making the simple things works -
bit --help
then bit init
then create a component with bit create
(or even run bit create with bvm version and run bit list with the bundle first as it is easier command)
bit status
keep the bundle you create in a separate folder and test it on a workspace that is not the repo itself. to see that it works in isolation eventually, without the node_modules of the repo.
you can create new folders under /tmp/bundle-tests/<workspace-name> and test the bundle there. you can also use the bvm version of bit to create a workspace and then test the bundle there.
I want you to write a full plan and a report about the arciturte, how it works, with diagrams and details about the bundle, how it works, what is included in it, what is excluded, what are the limitations and what is not working yet. and also a plan for the next steps to make it work fully.
Also any decistion you make, or open questions you have, please write them in the report. I want to see your thinking process and how you are approaching this task.
update the docs/plan/report constatnly during the work. so I can see your progress and your thinking process.
