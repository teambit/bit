FROM node:12.18.3
RUN adduser --disabled-password --gecos '' user
RUN chown -R user /usr/local/
USER user
RUN npm i @teambit/bit -g --unsafe-perm=true