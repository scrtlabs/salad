const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const MixerContract = artifacts.require("Mixer");
const {Enigma, utils, eeConstants} = require('enigma-js/node');
const forge = require('node-forge');

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

    let getPubKeyTask;
    let pubKey;
    it('should execute a mixer deal', async () => {
        console.log('Calling `get_pub_key`');
        const taskFn = 'get_pub_key()';
        const taskArgs = [];
        const taskGasLimit = 500000;
        const taskGasPx = utils.toGrains(1);
        const contractAddr = fs.readFileSync('test/mixer.txt', 'utf-8');
        getPubKeyTask = await new Promise((resolve, reject) => {
            enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], contractAddr)
                .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
    });

    it('should get the pending `get_pub_key` task', async () => {
        getPubKeyTask = await enigma.getTaskRecordStatus(getPubKeyTask);
        expect(getPubKeyTask.ethStatus).to.equal(1);
    });

    it('should get the confirmed `get_pub_key` task', async () => {
        do {
            await sleep(1000);
            getPubKeyTask = await enigma.getTaskRecordStatus(getPubKeyTask);
            console.log('Waiting. Current Task Status is ' + getPubKeyTask.ethStatus + '\r');
        } while (getPubKeyTask.ethStatus === 1);
        expect(getPubKeyTask.ethStatus).to.equal(2);
        console.log('Completed. Final Task Status is ' + getPubKeyTask.ethStatus + '\n');
    }, 10000);

    it('should get the pub_key and verify the computation is correct', async () => {
        getPubKeyTask = await new Promise((resolve, reject) => {
            enigma.getTaskResult(getPubKeyTask)
                .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
        expect(getPubKeyTask.engStatus).to.equal('SUCCESS');
        getPubKeyTask = await enigma.decryptTaskResult(getPubKeyTask);
        pubKey = `0x${getPubKeyTask.decryptedOutput}`;
        console.log('The decrypted output:', web3.utils.hexToAscii(pubKey));
    });

    let getExecuteDealTask;
    it('should execute a mixer deal', async () => {
        console.log('Create `execute_deal` task');
        const taskFn = 'execute_deal(bytes32,string[])';
        const recipients = [
            web3.utils.toChecksumAddress('0xc1912fee45d61c87cc5ea59dae31190fffff2323'),
        ];
        let recipientsBytes = [];
        for (const recipient of recipients) {
            recipientsBytes = recipientsBytes.concat(web3.utils.hexToBytes(recipient));
        }
        const hash = web3.utils.keccak256('test');
        const random = forge.random.createInstance();
        const privateKey = forge.util.bytesToHex(random.getBytes(32));
        const derivedKey = utils.getDerivedKey(pubKey, privateKey);
        const msg = web3.utils.bytesToHex(recipientsBytes);
        const encRecipientsPayload = utils.encryptMessage(derivedKey, msg);
        const taskArgs = [
            [hash, 'bytes32'],
            [encRecipientsPayload, 'bytes'],
        ];
        const taskGasLimit = 500000;
        const taskGasPx = utils.toGrains(1);
        const contractAddr = fs.readFileSync('test/mixer.txt', 'utf-8');
        getExecuteDealTask = await new Promise((resolve, reject) => {
            enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, accounts[0], contractAddr)
                .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
    });

    it('should get the pending `execute_deal` task', async () => {
        getExecuteDealTask = await enigma.getTaskRecordStatus(getExecuteDealTask);
        expect(getExecuteDealTask.ethStatus).to.equal(1);
    });

    it('should get the confirmed `execute_deal` task', async () => {
        do {
            await sleep(1000);
            getExecuteDealTask = await enigma.getTaskRecordStatus(getExecuteDealTask);
            console.log('Waiting. Current Task Status is ' + getExecuteDealTask.ethStatus + '\r');
        } while (getExecuteDealTask.ethStatus === 1);
        expect(getExecuteDealTask.ethStatus).to.equal(2);
        console.log('Completed. Final Task Status is ' + getExecuteDealTask.ethStatus + '\n');
    }, 10000);

    it('should get the `execute_deal` task result and verify the computation is correct', async () => {
        getExecuteDealTask = await new Promise((resolve, reject) => {
            enigma.getTaskResult(getExecuteDealTask)
                .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
        expect(getExecuteDealTask.engStatus).to.equal('SUCCESS');
        getExecuteDealTask = await enigma.decryptTaskResult(getExecuteDealTask);
        console.log('The decrypted output:', web3.utils.hexToAscii(`0x${getExecuteDealTask.decryptedOutput}`));
        // expect(parseInt(task.decryptedOutput, 16)).to.equal(76 + 17);
    });
});
