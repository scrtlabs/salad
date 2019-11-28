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

const {getEnigmaContractAddress} = require('@salad/client/src/enigmaSmartContract');
const {getEnigmaTokenContractAddress} = require('@salad/client/src/enigmaTokenSmartContract');
const provider = new Web3.providers.HttpProvider(`http://${process.env.ETH_HOST}:9545`);
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
    scTask = await new Promise((resolve, reject) => {
        enigma.deploySecretContract(config.fn, args, config.gasLimit, config.gasPrice, config.from, preCode)
            .on(eeConstants.DEPLOY_SECRET_CONTRACT_RESULT, (receipt) => resolve(receipt))
            .on(eeConstants.ERROR, (error) => reject(error));
    });

    // Wait for the confirmed deploy contract task
    do {
        await sleep(1000);
        try {
            scTask = await enigma.getTaskRecordStatus(scTask);
        } catch (e) {
            console.error('Unable to deploy', e);
        }
        process.stdout.write('Waiting. Current Task Status is ' + scTask.ethStatus + '\r');
    } while (scTask.ethStatus === 1);
    process.stdout.write('Completed. Final Task Status is ' + scTask.ethStatus + '\n');

    console.log('SC ADDRESS', scTask.scAddr);

    // Verify deployed contract
    const result = await enigma.admin.isDeployed(scTask.scAddr);
    if (result) {
        // fs.writeFile(path.resolve(migrationsFolder, '../test/', config.filename.replace(/\.wasm$/, '.txt')), scTask.scAddr, 'utf8', function (err) {
        //     if (err) {
        //         return console.log(err);
        //     }
        // });

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

    let enigmaHost = process.env.ENIGMA_HOST || 'localhost';
    let enigmaPort = process.env.ENIGMA_PORT || '3333';


    console.log('enigma host is at ' + 'http://'+enigmaHost+':'+enigmaPort);
    enigma = new Enigma(
        web3,
        await getEnigmaContractAddress(),
        await getEnigmaTokenContractAddress(),
        'http://worker:3346',
        {
            gas: 4712388,
            gasPrice: 100000000000,
            from: accounts[0],
        },
    );
    enigma.admin();
    enigma.setTaskKeyPair();

    // Deploy the Smart and Secret contracts:
    const depositLockPeriodInBlocks = process.env.DEPOSIT_LOCK_PERIOD_IN_BLOCKS;
    const dealIntervalInBlocks = process.env.DEAL_INTERVAL_IN_BLOCKS;
    const relayerFeePercent = process.env.RELAYER_FEE_PERCENT;
    const participationThreshold = process.env.PARTICIPATION_THRESHOLD;
    console.log('Deploying Salad(', depositLockPeriodInBlocks, dealIntervalInBlocks, relayerFeePercent, participationThreshold, ')');
    await deployer.deploy(Salad, depositLockPeriodInBlocks, dealIntervalInBlocks, relayerFeePercent, participationThreshold);
    console.log(`Smart Contract "Salad.Sol" has been deployed at ETH address: ${Salad.address}`);
    await store.insertSmartContractAddress(Salad.address);

    const config = {
        filename: 'salad.wasm',
        fn: 'construct()',
        args: [],
        gasLimit: 2000000,
        gasPrice: utils.toGrains(0.001),
        from: accounts[0]
    };
    const scAddress = await deploySecretContract(config, Salad.address);
    await store.insertSecretContractAddress(scAddress);
    console.log(`Secret Contract "${config.filename}" deployed at Enigma address: ${scAddress}`);
    await store.closeAsync();
};
