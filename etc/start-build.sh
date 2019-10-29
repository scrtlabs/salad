echo "Waiting for the Key Management node to start..."
until curl -s -m 1 km:3040 >/dev/null 2>&1; do sleep 2; done

echo "Network online, starting build..."
cd src || exit
yarn install
yarn compile
yarn test
/bin/bash
