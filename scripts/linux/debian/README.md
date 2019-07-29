Docker image to build the deb file to upload to the jfrog.

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
npm run build-debian-image
```

## run 
```bash
docker run -it --volume [path-to-bit]:/bit-bin debian-deb
```

## build rpm file
inside the container
```bash
cd bit-bin
./scripts/linux/debian/build-linux-deb.sh
```