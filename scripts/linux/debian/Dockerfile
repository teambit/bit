FROM debian
RUN apt-get update && apt-get install -y curl software-properties-common
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get -y install nano git nodejs ruby ruby-dev rubygems build-essential
RUN gem install --no-ri --no-rdoc fpm
RUN npm i -g pkg@4.4.6
RUN sh -c "echo 'deb [trusted=true] https://bitsrc.jfrog.io/bitsrc/bit-deb all development' >> /etc/apt/sources.list"
CMD ["/bin/bash"]
