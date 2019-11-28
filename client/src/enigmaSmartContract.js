const axios = require('axios');

const KUBERNETES_NETWORK_CONTRACT_LOCATION = `http://${process.env.CONTRACT_ADDRESS_HOST}:8081/contract/address?name=enigmacontract.txt`;

let enigmaContractPath;
if (process.env.SGX_MODE === 'SW') {
    enigmaContractPath = './EnigmaSimulation.json';  // TODO change back to refer to the build dir, and delete the local copy
} else if (process.env.SGX_MODE === 'HW') {
    enigmaContractPath = './Enigma.json';
} else {
    console.log('SGX_MODE must be set to either SW or HW (default)');
    process.exit(1);
}

// This function is provided because the address of the enigma contract is available in different locations
// when running in different networks.
async function getEnigmaContractAddress() {
    let enigmaContractAddress;
    if (process.env.ENIGMA_ENV === 'COMPOSE') {
        console.log('looking up address');
        // The contract was deployed by the network itself, and is published behind this URL:
        enigmaContractAddress = (await axios.get(KUBERNETES_NETWORK_CONTRACT_LOCATION)).data;
    } else {
        // The contract was migrated locally, so we can find its address here:
        const EnigmaContract = require(enigmaContractPath);
        enigmaContractAddress = EnigmaContract[process.env.ETH_NETWORK_ID || '4447'].address;
    }
    console.log('found address ' + enigmaContractAddress);

    return enigmaContractAddress;
}

module.exports = {getEnigmaContractAddress};
