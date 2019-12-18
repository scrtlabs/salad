const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const dotenv = require('dotenv');
const Salad = artifacts.require('Salad.sol');
const {Enigma, utils, eeConstants} = require('enigma-js/node');
const {Store} = require("@salad/operator");
const {CONFIG_COLLECTION} = require('@salad/operator/src/store');

dotenv.config({path: path.resolve(process.cwd(), '..', '.env')});
const debug = require('debug')('deploy');
debug.enabled = true;

const migrationsFolder = process.cwd();   // save it because it changes later on...

const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);

const web3 = new Web3(provider);
let enigma = null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let SECRET_CONTRACT_BUILD_FOLDER = process.env.SECRET_CONTRACT_BUILD_FOLDER || '../build/secret_contracts';

function getEnigmaContractAddressFromJson() {
    let enigmaContract;
    if (process.env.SGX_MODE === 'SW') {
        enigmaContract = require('../build/enigma_contracts/EnigmaSimulation.json');
    } else if (process.env.SGX_MODE === 'HW') {
        enigmaContract = require('../build/enigma_contracts/Enigma.json');
    } else {
        throw new Error(`SGX_MODE must be set to either SW or HW`);
    }
    return enigmaContract.networks[process.env.ETH_NETWORK_ID].address;
}

function getEnigmaTokenContractAddressFromJson() {
    const enigmaTokenContract = require('../build/enigma_contracts/EnigmaToken.json');
    return enigmaTokenContract.networks[process.env.ETH_NETWORK_ID].address;
}

async function deploySecretContract(config, saladAddr, enigmaAddr, enigmaTokenAddr) {
    debug(`Deploying Secret Contract "${config.filename}"...`);
    debug('The Enigma address / token address', enigmaAddr, enigmaTokenAddr);
    let scTask;
    let preCode;
    try {
        preCode = fs.readFileSync(path.resolve(migrationsFolder, SECRET_CONTRACT_BUILD_FOLDER, config.filename));
    } catch (e) {
        debug('Error:', e.stack);
    }
    const {args} = config;
    args.push([saladAddr, 'address']);

    let enigmaHost = process.env.ENIGMA_HOST || 'localhost';
    let enigmaPort = process.env.ENIGMA_PORT || '3333';

    debug('enigma host is at ' + 'http://' + enigmaHost + ':' + enigmaPort);
    enigma = new Enigma(
        web3,
        enigmaAddr,
        enigmaTokenAddr,
        'http://' + enigmaHost + ':' + enigmaPort,
        {
            gas: 4712388,
            gasPrice: 100000000000,
            from: config.from,
        },
    );
    enigma.admin();
    enigma.setTaskKeyPair();

    // Waiting for a worker to register with the enigma network:
    while (true) {
        debug('waiting for a worker to register to the enigma network');
        await sleep(5000);
        const blockNumber = await web3.eth.getBlockNumber();
        const worker_params = await enigma.getWorkerParams(blockNumber);
        debug('worker params := ' + JSON.stringify(worker_params));
        if (worker_params.workers.length >= 1) {
            break;
        }
    }

    scTask = await new Promise((resolve, reject) => {
        enigma.deploySecretContract(config.fn, args, config.gasLimit, config.gasPrice, config.from, preCode)
            .on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt))
            .on(eeConstants.ERROR, (error) => reject(error));
    });

    // Wait for the confirmed deploy contract task
    do {
        debug('waiting for the secret contract to finish deploying.');
        await sleep(5000);
        try {
            scTask = await enigma.getTaskRecordStatus(scTask);
        } catch (e) {
            debug('Unable to deploy', e);
        }
        debug('Waiting. Current Task Status is ' + scTask.ethStatus);
    } while (scTask.ethStatus === 1);
    debug('Completed. Final Task Status is ' + scTask.ethStatus);

    debug('SC ADDRESS', scTask.scAddr);

    // Verify deployed contract
    if (await enigma.admin.isDeployed(scTask.scAddr)) {
        return scTask.scAddr;
    } else {
        debug('Something went wrong deploying Secret Contract:', scTask.scAddr, ', aborting');
        debug(scTask);
        process.exit();
    }
}

module.exports = async function (deployer, network, accounts) {
    debug('Deploying Salad contracts');
    const store = new Store();
    await store.initAsync();
    await store.truncate(CONFIG_COLLECTION);

    const enigmaAddr = process.env.ENIGMA_CONTRACT_ADDRESS || getEnigmaContractAddressFromJson();
    const enigmaTokenAddr = process.env.ENIGMA_TOKEN_CONTRACT_ADDRESS || getEnigmaTokenContractAddressFromJson();
    // Adding the Enigma contract addresses to db to avoid re-fetching them from the environment in any of the shared components
    await store.insertEnigmaContractAddresses(enigmaAddr, enigmaTokenAddr);
    const sender = accounts[0];
    // Deploy the Smart and Secret contracts:
    const depositLockPeriodInBlocks = process.env.DEPOSIT_LOCK_PERIOD_IN_BLOCKS;
    const dealIntervalInBlocks = process.env.DEAL_INTERVAL_IN_BLOCKS;
    const relayerFeePercent = process.env.RELAYER_FEE_PERCENT;
    const participationThreshold = process.env.PARTICIPATION_THRESHOLD;
    debug('Deploying Salad(', depositLockPeriodInBlocks, dealIntervalInBlocks, relayerFeePercent, participationThreshold, ')');
    await deployer.deploy(Salad, depositLockPeriodInBlocks, dealIntervalInBlocks, sender, relayerFeePercent, participationThreshold);
    debug(`Smart Contract "Salad.Sol" has been deployed at ETH address: ${Salad.address}`);
    await store.insertSmartContractAddress(Salad.address);

    const config = {
        filename: 'salad.wasm',
        fn: 'construct()',
        args: [],
        gasLimit: 2000000,
        gasPrice: utils.toGrains(0.001),
        from: sender
    };
    const scAddress = await deploySecretContract(config, Salad.address, enigmaAddr, enigmaTokenAddr);
    await store.insertSecretContractAddress(scAddress);
    debug(`Secret Contract "${config.filename}" deployed at Enigma address: ${scAddress}`);
    await store.closeAsync();
};
