Docker image to build the rpm file to upload to the jfrog.

## pre requisite
Make sure you have the binaries created by pkg before starting (later this will be part of the process)
```bash
git clone https://github.com/teambit/bit.git
cd bit
npm i
npm run build
npm run pkg:all
```


## build
on the project root
```bash
npm run build-centos-image
```

## run 
```bash
docker run -it --volume [path-to-bit]:/bit-bin centos-rpm
```

## build rpm file
inside the container
```bash
cd bit-bin
./scripts/linux/centos/build-linux-rpm.sh
```