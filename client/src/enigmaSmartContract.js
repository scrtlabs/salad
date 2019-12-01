const axios = require('axios');

const KUBERNETES_NETWORK_CONTRACT_LOCATION = `http://${process.env.CONTRACT_ADDRESS_HOST}:8081/contract/address?name=enigmacontract.txt`;

let enigmaContractPath;
if (process.env.SGX_MODE === 'SW') {
    enigmaContractPath = '../../build/enigma_contracts/EnigmaSimulation.json';
} else if (process.env.SGX_MODE === 'HW') {
    enigmaContractPath = '../../build/enigma_contracts/Enigma.json';
} else {
    throw new Error('SGX_MODE must be set to either SW or HW (default)');
}

// This function is provided because the address of the enigma contract is available in different locations
// when running in different networks.
async function getEnigmaContractAddress() {
    let enigmaContractAddress;
    if (process.env.ENIGMA_ENV === 'COMPOSE') {
        console.error('looking up Enigma address for the Enigma contract at ' + KUBERNETES_NETWORK_CONTRACT_LOCATION);
        // The contract was deployed by the network itself, and is published behind this URL:
        enigmaContractAddress = (await axios.get(KUBERNETES_NETWORK_CONTRACT_LOCATION)).data;
    } else {
        // The contract was migrated locally, so we can find its address here:
        const EnigmaContract = require(enigmaContractPath);
        enigmaContractAddress = EnigmaContract[process.env.ETH_NETWORK_ID || '4447'].address;
    }
    console.error('found Enigma contract address ' + enigmaContractAddress);

    return enigmaContractAddress;
}

module.exports = {getEnigmaContractAddress};
