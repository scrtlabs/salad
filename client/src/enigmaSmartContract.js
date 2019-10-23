let EnigmaContract;
if (process.env.SGX_MODE === 'SW') {
    EnigmaContract = require('../../build/enigma_contracts/EnigmaSimulation.json');
} else if (process.env.SGX_MODE === 'HW') {
    EnigmaContract = require('../../build/enigma_contracts/Enigma.json');
} else {
    console.log('SGX_MODE must be set to either SW or HW (default)');
    process.exit();
}

module.exports = {EnigmaContract};
