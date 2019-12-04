FROM node:10-buster

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- --default-toolchain nightly -y

ENV PATH=/root/.cargo/bin:$PATH

COPY rust-toolchain /root/salad/rust-toolchain

RUN export RUST_TOOLCHAIN=$(cat /root/salad/rust-toolchain) && \
  rustup toolchain add $RUST_TOOLCHAIN --target wasm32-unknown-unknown

COPY .env.template /root/salad/.env
COPY client/ /root/salad/client/
COPY config/ /root/salad/config/
COPY docker-compose.cli-sw.yml /root/salad/docker-compose.cli-sw.yml
COPY migrations/ /root/salad/migrations/
COPY operator/ /root/salad/operator/
COPY package.json /root/salad/package.json
COPY secret_contracts/ /root/salad/secret_contracts/
COPY smart_contracts/ /root/salad/smart_contracts/
COPY test/ /root/salad/test/
COPY truffle.js /root/salad/truffle.js
COPY yarn.lock /root/salad/yarn.lock

WORKDIR /root/salad
RUN yarn install
RUN yarn add -W async

RUN sed -i "s/ETH_HOST=localhost/ETH_HOST=contract/" .env && \
  sed -i "s/ENIGMA_HOST=localhost/ENIGMA_HOST=nginx/" .env && \
  sed -i "s/MONGO_HOST=localhost/MONGO_HOST=mongo/" .env && \
  sed -i "s/SGX_MODE=HW/SGX_MODE=SW/" .env

RUN cp operator/.env.template operator/.env && \
  sed -i "s/ETH_HOST=localhost/ETH_HOST=contract/" operator/.env && \
  sed -i "s/ENIGMA_HOST=localhost/ENIGMA_HOST=nginx/" operator/.env && \
  sed -i "s/MONGO_HOST=localhost/MONGO_HOST=mongo/" operator/.env

RUN cp docker-compose.cli-sw.yml docker-compose.yml && \
  sed -i "s/host: 'localhost'/host: 'contract'/" truffle.js

RUN npx truffle compile
RUN npx discovery compile

ENTRYPOINT ["/usr/bin/env"]
CMD ["/bin/bash"]
