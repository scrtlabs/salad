const {Enigma, utils, eeConstants} = require('enigma-js/node');

// TODO: Move path to config and reference Github
const EnigmaContract = require('../../build/enigma_contracts/Enigma.json');
const EnigmaTokenContract = require('../../build/enigma_contracts/EnigmaToken.json');

class SecretContractClient {
    constructor(web3, scAddr, accountIndex = 0) {
        this.scAddr = scAddr;
        this.pubKey = null;
        this.web3 = web3;
        this.accountIndex = accountIndex;
        this.accounts = [];
    }

    async initAsync() {
        const accounts = this.accounts = await this.web3.eth.getAccounts();
        this.enigma = new Enigma(
            this.web3,
            EnigmaContract.networks[process.env.ETH_NETWORK_ID].address,
            EnigmaTokenContract.networks[process.env.ETH_NETWORK_ID].address,
            `http://${process.env.ENIGMA_HOST}:${process.env.ENIGMA_PORT}`,
            {
                gas: 4712388,
                gasPrice: process.env.GAS_PRICE,
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
        // TODO: Why is the code suddenly replace by a string?
        if (task.ethStatus !== 'SUCCESS') {
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

    async fetchPubKeyAsync() {
        console.log('Calling `get_pub_key`');
        const taskFn = 'get_pub_key()';
        const taskArgs = [];
        const taskGasLimit = 500000;
        const taskGasPx = utils.toGrains(1);
        const pendingTask = this.submitTaskAsync(taskFn, taskArgs, taskGasLimit, taskGasPx, this.getOperatorAccount(), this.scAddr);
        const task = await this.waitTaskSuccessAsync(pendingTask);
        const output = await this.fetchOutput(task);
        return this.pubKey = `0x${output}`;
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

    async getPubKeyAsync() {
        // TODO: Wait if currently fetching the key
        return new Promise((resolve) => {
            resolve(this.pubKey);
        });
    }
}

module.exports = {SecretContractClient};