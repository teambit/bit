FROM centos
RUN curl -sL https://rpm.nodesource.com/setup_10.x | bash -
RUN yum install -y git gcc-c++ make rpm dpkg-deb fakeroot rpmbuild ruby-devel gcc rpm-build rubygems nodejs
RUN yum install -y nano
RUN gem install --no-ri --no-rdoc fpm
COPY ./bit.repo /etc/yum.repos.d/bit.repo
RUN npm i -g pkg@4.4.6
CMD ["/bin/bash"]
