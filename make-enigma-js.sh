set -e

rm -rf temp
mkdir temp
pushd temp
git clone https://github.com/enigmampc/enigma-contract.git
pushd enigma-contract
yarn
# Assumption truffle-cli exists
truffle compile
cd enigma-js
yarn
yarn webpack --env build
popd
popd


