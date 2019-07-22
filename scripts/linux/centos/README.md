Docker image to build the rpm file to upload to the jfrog.

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
./scripts/linux/build-linux.sh
```