const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const dotenv = require('dotenv');
const Salad = artifacts.require('Salad.sol');
const {Enigma, utils, eeConstants} = require('enigma-js/node');
const {Store} = require("@salad/operator");
const {CONFIG_COLLECTION} = require('@salad/operator/src/store');

dotenv.config({path: path.resolve(process.cwd(), '..', '.env')});
const debug = require('debug')('operator:server');

const migrationsFolder = process.cwd();   // save it because it changes later on...

const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:${process.env.ETH_PORT}`);

const web3 = new Web3(provider);
let enigma = null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let SECRET_CONTRACT_BUILD_FOLDER = null;
if (process.env.ENIGMA_ENV === 'COMPOSE') {
    // In the docker compose environment, this file is provided in the root directory of the project
    SECRET_CONTRACT_BUILD_FOLDER = '..';
} else {
    SECRET_CONTRACT_BUILD_FOLDER = '../build/secret_contracts';
}

async function deploySecretContract(config, mixerEthAddress) {
    debug(`Deploying Secret Contract "${config.filename}"...`);
    let scTask;
    let preCode;
    try {
        preCode = fs.readFileSync(path.resolve(migrationsFolder, SECRET_CONTRACT_BUILD_FOLDER, config.filename));
    } catch (e) {
        console.log('Error:', e.stack);
    }
    const {args} = config;
    args.push([mixerEthAddress, 'address']);

    let enigmaHost = process.env.ENIGMA_HOST || 'localhost';
    let enigmaPort = process.env.ENIGMA_PORT || '3333';

    console.log('enigma host is at ' + 'http://'+enigmaHost+':'+enigmaPort);
    enigma = new Enigma(
        web3,
        process.env.ENIGMA_CONTRACT_ADDRESS,
        process.env.ENIGMA_TOKEN_CONTRACT_ADDRESS,
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
        console.log('waiting for a worker to register to the enigma network');
        await sleep(5000);
        const blockNumber = await web3.eth.getBlockNumber();
        const worker_params = await enigma.getWorkerParams(blockNumber);
        console.log('worker params := ' + JSON.stringify(worker_params));
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
        console.log('waiting for the secret contract to finish deploying.');
        await sleep(5000);
        try {
            scTask = await enigma.getTaskRecordStatus(scTask);
        } catch (e) {
            console.log('Unable to deploy', e);
        }
        console.log('Waiting. Current Task Status is ' + scTask.ethStatus);
    } while (scTask.ethStatus === 1);
    console.log('Completed. Final Task Status is ' + scTask.ethStatus);

    console.log('SC ADDRESS', scTask.scAddr);

    // Verify deployed contract
    if (await enigma.admin.isDeployed(scTask.scAddr)) {
        return scTask.scAddr;
    } else {
        console.log('Something went wrong deploying Secret Contract:', scTask.scAddr, ', aborting');
        console.log(scTask);
        process.exit();
    }
}

module.exports = async function (deployer, network, accounts) {
    const store = new Store();
    await store.initAsync();
    await store.truncate(CONFIG_COLLECTION);

    const sender = accounts[0];
    // Deploy the Smart and Secret contracts:
    const depositLockPeriodInBlocks = process.env.DEPOSIT_LOCK_PERIOD_IN_BLOCKS;
    const dealIntervalInBlocks = process.env.DEAL_INTERVAL_IN_BLOCKS;
    const relayerFeePercent = process.env.RELAYER_FEE_PERCENT;
    const participationThreshold = process.env.PARTICIPATION_THRESHOLD;
    console.log('Deploying Salad(', depositLockPeriodInBlocks, dealIntervalInBlocks, relayerFeePercent, participationThreshold, ')');
    await deployer.deploy(Salad, depositLockPeriodInBlocks, dealIntervalInBlocks, sender, relayerFeePercent, participationThreshold);
    console.log(`Smart Contract "Salad.Sol" has been deployed at ETH address: ${Salad.address}`);
    await store.insertSmartContractAddress(Salad.address);

    const config = {
        filename: 'salad.wasm',
        fn: 'construct()',
        args: [],
        gasLimit: 2000000,
        gasPrice: utils.toGrains(0.001),
        from: sender
    };
    const scAddress = await deploySecretContract(config, Salad.address);
    await store.insertSecretContractAddress(scAddress);
    console.log(`Secret Contract "${config.filename}" deployed at Enigma address: ${scAddress}`);
    await store.closeAsync();
};
