const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const MixerContract = artifacts.require("Mixer");
const {Enigma, utils, eeConstants} = require('enigma-js/node');

let EnigmaContract;
if (typeof process.env.SGX_MODE === 'undefined' || (process.env.SGX_MODE != 'SW' && process.env.SGX_MODE != 'HW')) {
    console.log(`Error reading ".env" file, aborting....`);
    process.exit();
} else if (process.env.SGX_MODE == 'SW') {
    EnigmaContract = require('../build/enigma_contracts/EnigmaSimulation.json');
} else {
    EnigmaContract = require('../build/enigma_contracts/Enigma.json');
}
const EnigmaTokenContract = require('../build/enigma_contracts/EnigmaToken.json');


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let enigma = null;

contract("Mixer", accounts => {
    before(function () {
        enigma = new Enigma(
            web3,
            EnigmaContract.networks['4447'].address,
            EnigmaTokenContract.networks['4447'].address,
            'http://localhost:3346',
            {
                gas: 4712388,
                gasPrice: 100000000000,
                from: accounts[0],
            },
        );
        enigma.admin();
    });

    let task;
    it('should execute a mixer deal', async () => {
        console.log('Create `execute_deal` task');
        const taskFn = 'execute_deal(bytes32,string[])';
        const hash = web3.utils.keccak256('test');
        const encRecipientsPayload = web3.utils.bytesToHex([1, 1, 0, 1, 1]);
        const taskArgs = [
            [hash, 'bytes32'],
            [encRecipientsPayload, 'bytes'],
        ];
        const taskGasLimit = 500000;
        const taskGasPx = utils.toGrains(1);
        const contractAddr = fs.readFileSync('test/mixer.txt', 'utf-8');
        task = await new Promise((resolve, reject) => {
            enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], contractAddr)
                .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
    });

    it('should get the pending task', async () => {
        task = await enigma.getTaskRecordStatus(task);
        expect(task.ethStatus).to.equal(1);
    });

    it('should get the confirmed task', async () => {
        do {
            await sleep(1000);
            task = await enigma.getTaskRecordStatus(task);
            console.log('Waiting. Current Task Status is ' + task.ethStatus + '\r');
        } while (task.ethStatus === 1);
        expect(task.ethStatus).to.equal(2);
        console.log('Completed. Final Task Status is ' + task.ethStatus + '\n');
    }, 10000);

    it('should get the result and verify the computation is correct', async () => {
        task = await new Promise((resolve, reject) => {
            enigma.getTaskResult(task)
                .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
        expect(task.engStatus).to.equal('SUCCESS');
        task = await enigma.decryptTaskResult(task);
        console.log('The decrypted output:', web3.utils.hexToAscii(`0x${task.decryptedOutput}`));
        // expect(parseInt(task.decryptedOutput, 16)).to.equal(76 + 17);
    });

});
