const axios = require('axios');

const KUBERNETES_NETWORK_TOKEN_CONTRACT_LOCATION = `http://${process.env.CONTRACT_ADDRESS_HOST}:8081/contract/address?name=enigmatokencontract.txt`;

// This function is provided because the address of the enigma contract is available in different locations
// when running in different networks.
async function getEnigmaTokenContractAddress() {
    let enigmaTokenContractAddress;
    if (process.env.ENIGMA_ENV === 'COMPOSE') {
        // The contract was deployed by the network itself, and is published behind this URL:
        enigmaTokenContractAddress = (await axios.get(KUBERNETES_NETWORK_TOKEN_CONTRACT_LOCATION)).data;
    } else {
        // The contract was migrated locally, so we can find its address here:
        const EnigmaTokenContract = require('./EnigmaToken.json');
        enigmaTokenContractAddress = EnigmaTokenContract[process.env.ETH_NETWORK_ID || '4447'].address;
    }

    return enigmaTokenContractAddress;
}

module.exports = {getEnigmaTokenContractAddress};
