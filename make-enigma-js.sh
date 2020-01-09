set -e

rm -rf temp
mkdir temp
cd temp
git clone https://github.com/enigmampc/enigma-contract.git
cd enigma-contract
yarn
# Assumption truffle-cli exists
truffle compile
cd enigma-js
yarn
yarn webpack --env build
cd ..
cd ..


