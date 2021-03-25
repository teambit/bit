FROM node:12.18.3
RUN adduser --disabled-password --gecos '' user
RUN chown -R user /usr/local/
USER user

# RUN npm i @teambit/bvm -g
# RUN bvm upgrade
# RUN bvm link bbit
# ENV PATH=$PATH:/home/user/bin
RUN npm i @teambit/bit -g --unsafe-perm=true
RUN bbit config set analytics_reporting false
RUN bbit config set no_warnings false
RUN bbit config set interactive false
RUN bbit config set error_reporting true
RUN ln -s /usr/local/bin/bbit /usr/local/bin/bit

RUN bit config set analytics_reporting false
RUN bit config set no_warnings false
RUN bit config set interactive false
RUN bit config set error_reporting true
RUN ln -s /tmp/symphony/etc/.bitrc.jsonc ~/.bitrc.jsonc
WORKDIR /tmp/scope-fs
CMD bit start
