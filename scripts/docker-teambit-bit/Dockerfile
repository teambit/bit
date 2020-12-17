FROM node:12.18.3
RUN adduser --disabled-password --gecos '' user
RUN chown -R user /usr/local/
RUN bbit config set analytics_reporting false
RUN bbit config set no_warnings false
USER user
RUN npm i @teambit/bit -g --unsafe-perm=true