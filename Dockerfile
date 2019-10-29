FROM node:10.16.2-stretch

RUN \
  apt-get update && \
  apt-get -y upgrade && \
  apt-get install -y build-essential && \
  apt-get install -y software-properties-common && \
  apt-get install -y curl git man unzip vim python \
    ca-certificates file autoconf automake autotools-dev libtool \
    xutils-dev

# Rust stuff
ENV SSL_VERSION=1.0.2s

RUN curl https://www.openssl.org/source/openssl-$SSL_VERSION.tar.gz -O && \
    tar -xzf openssl-$SSL_VERSION.tar.gz && \
    cd openssl-$SSL_VERSION && ./config && make depend && make install && \
    cd .. && rm -rf openssl-$SSL_VERSION*

ENV OPENSSL_LIB_DIR=/usr/local/ssl/lib \
    OPENSSL_INCLUDE_DIR=/usr/local/ssl/include \
    OPENSSL_STATIC=1

# install toolchain
RUN curl https://sh.rustup.rs -sSf | \
    sh -s -- --default-toolchain nightly -y

ENV PATH=/root/.cargo/bin:$PATH
RUN rustup toolchain install nightly-2019-08-01
RUN rustup override set nightly-2019-08-01
RUN rustup target add wasm32-unknown-unknown --toolchain nightly-2019-08-01

WORKDIR /root
COPY /etc/start-build.sh start-build.sh
COPY /etc/dotenv src/.env
COPY /client src/client
COPY /frontend src/frontend
COPY /migrations src/migrations
COPY /operator src/operator
COPY /secret_contracts src/secret_contracts
COPY /smart_contracts src/smart_contracts
COPY /test src/test
COPY /package.json src/package.json
COPY /rust-toolchain src/rust-toolchain
COPY /truffle.js src/truffle.js
COPY /yarn.lock src/yarn.lock
COPY /docker-compose.yml src/docker-compose.yml
RUN mkdir src/build
RUN npm install -g yarn

ENTRYPOINT ["bash"]
CMD ["/root/start-build.sh"]