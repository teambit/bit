if exist types rmdir /s/q types
node_modules\.bin\tsc.cmd --project tsconfig.types.json | more
xcopy /s/q/y types\src\* dist
rmdir /s/q types
