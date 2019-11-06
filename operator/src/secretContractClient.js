const {Enigma, utils, eeConstants} = require('enigma-js/node');
const debug = require('debug')('operator:secret-contract');

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
        /** @type EncryptionPubKey|null */
        this.pubKeyData = null;
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
        // TODO: Store key secrets in cache
        this.enigma.setTaskKeyPair();
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
        const encryptedOutput = taskWithResults.encryptedAbiEncodedOutputs;
        const taskWithPlaintextResults = await this.enigma.decryptTaskResult(taskWithResults);
        return {
            encrypted: encryptedOutput,
            plaintext: taskWithPlaintextResults.decryptedOutput,
        };
    }

    async waitTaskSuccessAsync(task) {
        debug('Waiting for task success', task);
        do {
            await sleep(1000);
            task = await this.enigma.getTaskRecordStatus(task);
            debug('Waiting. Current Task Status is ' + task.ethStatus + '\r');
        } while (task.ethStatus === 1);
        if (task.ethStatus === 3) {
            debug('Enigma network error with task:', task);
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

    async setPubKeyDataAsync(opts) {
        debug('Calling `get_pub_key`');
        const taskFn = 'get_pub_key()';
        const taskArgs = [];
        const {taskGasLimit, taskGasPx} = opts;
        const keyPair = this.enigma.obtainTaskKeyPair();
        debug('The key pair', keyPair);
        debug('submitTaskAsync(', taskFn, taskArgs, taskGasLimit, taskGasPx, this.getOperatorAccount(), this.scAddr, ')');
        const pendingTask = await this.submitTaskAsync(taskFn, taskArgs, taskGasLimit, taskGasPx, this.getOperatorAccount(), this.scAddr);
        debug('The pending task', pendingTask);
        const task = await this.waitTaskSuccessAsync(pendingTask);
        debug('The completed task', task);
        const output = await this.fetchOutput(task);
        this.pubKeyData = {
            taskId: task.taskId,
            encryptedOutput: output.encrypted,
            userPrivateKey: keyPair.privateKey,
            workerPubKey: task.workerEncryptionKey,
        };
        // TODO: Store key secrets in cache
        // Setting a new key pair so that the encryption private key can be revealed without
        // revealing subsequent deal encryption data;
        this.enigma.setTaskKeyPair();
    }

    _prepareDepositsParams(deposits) {
        const nbRecipient = deposits.length;
        const pubKeys = [];
        const encRecipients = [];
        const senders = [];
        const signatures = [];
        for (const deposit of deposits) {
            pubKeys.push(`0x${deposit.pubKey}`);
            encRecipients.push(`0x${deposit.encRecipient}`);
            senders.push(deposit.sender);
            signatures.push(deposit.signature);
        }
        return {nbRecipient, pubKeys, encRecipients, senders, signatures};
    }

    async executeDealAsync(amount, deposits, nonce, opts) {
        const {nbRecipient, pubKeys, encRecipients, senders, signatures} = this._prepareDepositsParams(deposits);
        const operatorAddress = this.getOperatorAccount();
        debug('Calling `execute_deal(address,uint256,uint256,uint256,bytes[],bytes[],address[],bytes[])`',
            operatorAddress, nbRecipient, amount, pubKeys, encRecipients, senders, signatures);
        const taskFn = 'execute_deal(address,uint256,uint256,uint256,bytes[],bytes[],address[],bytes[])';
        const taskArgs = [
            [operatorAddress, 'address'],
            [nonce, 'uint256'],
            [nbRecipient, 'uint256'],
            [amount, 'uint256'],
            [pubKeys, 'bytes[]'],
            [encRecipients, 'bytes[]'],
            [senders, 'address[]'],
            [signatures, 'bytes[]'],
        ];
        const {taskGasLimit, taskGasPx} = opts;
        const pendingTask = await this.submitTaskAsync(taskFn, taskArgs, taskGasLimit, taskGasPx, operatorAddress, this.scAddr);
        const task = await this.waitTaskSuccessAsync(pendingTask);
        const {taskId} = task;
        // const taskRecord = await this.enigma.enigmaContract.methods.getTaskRecord(taskId).call();
        const output = await this.fetchOutput(task);
        debug('Got execute deal task', taskId, 'with results:', output);
        return task;
    }

    async verifyDepositsAsync(amount, deposits, opts) {
        const {nbRecipient, pubKeys, encRecipients, senders, signatures} = this._prepareDepositsParams(deposits);
        debug('Calling `verify_deposits(uint256,uint256,bytes[],bytes[],address[],bytes[])`',
            nbRecipient, amount, pubKeys, encRecipients, senders, signatures);
        const taskFn = 'verify_deposits(uint256,uint256,bytes[],bytes[],address[],bytes[])';
        const taskArgs = [
            [nbRecipient, 'uint256'],
            [amount, 'uint256'],
            [pubKeys, 'bytes[]'],
            [encRecipients, 'bytes[]'],
            [senders, 'address[]'],
            [signatures, 'bytes[]'],
        ];
        const {taskGasLimit, taskGasPx} = opts;
        const pendingTask = await this.submitTaskAsync(taskFn, taskArgs, taskGasLimit, taskGasPx, this.getOperatorAccount(), this.scAddr);
        const task = await this.waitTaskSuccessAsync(pendingTask);
        const output = await this.fetchOutput(task);
        debug('Got verified deposits task', task.taskId, 'with results:', output);
        return task;
    }

    async getPubKeyDataAsync(opts) {
        if (!this.pubKeyData) {
            debug('PubKey not found in cache, fetching from Enigma...');
            await this.setPubKeyDataAsync(opts);
            debug('Storing pubKey in cache', this.pubKeyData);
        }
        return this.pubKeyData;
    }
}

module.exports = {SecretContractClient};