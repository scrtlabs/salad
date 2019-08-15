const {Enigma, utils, eeConstants} = require('enigma-js/node');

// TODO: Move path to config and reference Github
const EnigmaContract = require('../../build/enigma_contracts/Enigma.json');
const EnigmaTokenContract = require('../../build/enigma_contracts/EnigmaToken.json');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class SecretContractClient {
    constructor(web3, scAddr, enigmaUrl, accountIndex = 0) {
        this.enigmaUrl = enigmaUrl;
        this.scAddr = scAddr;
        this.pubKey = null;
        this.web3 = web3;
        this.accountIndex = accountIndex;
        this.accounts = [];
    }

    async initAsync(engOpts) {
        const accounts = this.accounts = await this.web3.eth.getAccounts();
        const networkId = await this.web3.eth.net.getId();
        this.enigma = new Enigma(
            this.web3,
            EnigmaContract.networks[networkId].address,
            EnigmaTokenContract.networks[networkId].address,
            this.enigmaUrl,
            {
                gas: engOpts.taskGasLimit,
                gasPrice: engOpts.taskGasPx,
                from: accounts[this.accountIndex],
            },
        );
        this.enigma.admin();
    }

    getOperatorAccount() {
        return this.accounts[this.accountIndex];
    }

    async fetchOutput(task) {
        const taskWithResults = await new Promise((resolve, reject) => {
            this.enigma.getTaskResult(task)
                .on(eeConstants.GET_TASK_RESULT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
        if (task.ethStatus !== 2) {
            throw new Error(`Illegal state to fetch results for task: ${taskWithResults.taskId}`);
        }
        const taskWithPlaintextResults = await this.enigma.decryptTaskResult(taskWithResults);
        return taskWithPlaintextResults.decryptedOutput;
    }

    async waitTaskSuccessAsync(task) {
        do {
            await sleep(1000);
            task = await this.enigma.getTaskRecordStatus(task);
            console.log('Waiting. Current Task Status is ' + task.ethStatus + '\r');
        } while (task.ethStatus === 1);
        if (task.ethStatus === 3) {
            throw new Error(`Enigma network error with task: ${task.taskId}`);
        }
        return task;
    }

    async submitTaskAsync(taskFn, taskArgs, taskGasLimit, taskGasPx, sender, contractAddr) {
        return new Promise((resolve, reject) => {
            this.enigma.computeTask(taskFn, taskArgs, taskGasLimit, taskGasPx, sender, contractAddr)
                .on(eeConstants.SEND_TASK_INPUT_RESULT, (result) => resolve(result))
                .on(eeConstants.ERROR, (error) => reject(error));
        });
    }

    async fetchPubKeyAsync(engOpts) {
        console.log('Calling `get_pub_key`');
        const taskFn = 'get_pub_key()';
        const taskArgs = [];
        const {taskGasLimit, taskGasPx} = engOpts;
        const pendingTask = await this.submitTaskAsync(taskFn, taskArgs, taskGasLimit, taskGasPx, this.getOperatorAccount(), this.scAddr);
        const task = await this.waitTaskSuccessAsync(pendingTask);
        console.log('The completed task', task);
        // TODO: Why are there leading zeros?
        const output = await this.fetchOutput(task);
        const prefix = '00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040';
        this.pubKey = output.replace(prefix, '');
        console.log('The pubKey output', this.pubKey);
        return this.pubKey;
    }

    async executeDealAsync(dealId, encRecipientsPayload) {
        console.log('Calling `execute_deal(bytes32,string[])`');
        const taskFn = 'execute_deal(bytes32,string[])';
        const taskArgs = [
            [dealId, 'bytes32'],
            [encRecipientsPayload, 'bytes'],
        ];
        const taskGasLimit = 500000;
        const taskGasPx = utils.toGrains(1);
        const pendingTask = this.submitTaskAsync(taskFn, taskArgs, taskGasLimit, taskGasPx, this.getOperatorAccount(), this.scAddr);
        const task = await this.waitTaskSuccessAsync(pendingTask);
        const output = await this.fetchOutput(task);
        console.log('Deal executed', output);
    }

    async getPubKeyAsync(engOpts) {
        if (this.pubKey === null) {
            console.log('PubKey not found in cache, fetching  from Enigma...');
            this.pubKey = await this.fetchPubKeyAsync(engOpts);
            console.log('Storing pubKey in cache', this.pubKey);
        }
        return this.pubKey;
    }
}

module.exports = {SecretContractClient};