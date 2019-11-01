const {MongoClient} = require('mongodb');
const debug = require('debug')('operator:store');

const DEPOSITS_COLLECTION = 'deposits';
const DEALS_COLLECTION = 'deals';
const CACHE_COLLECTION = 'cache';
const CONFIG_COLLECTION = 'config';

class Store {
    constructor() {
        this._url = `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;
        this._dbName = process.env.DB_NAME;
    }

    async initAsync() {
        this.client = await MongoClient.connect(this._url);
        this.db = this.client.db(this._dbName);
    }

    async closeAsync() {
        if (!this.client) {
            throw new Error('No Mongo client, accountant not initialized');
        }
        debug('Closing db connection');
        return this.client.close();
    }

    async truncate(collection) {
        const result = await this.db.collection(collection).deleteMany({});
        debug('Truncated', collection);
    }

    async _findAllAsync(collection) {
        const result = await this.db.collection(collection).find({});
        return result.toArray();
    }

    async _insertRecordAsync(record, collection) {
        debug('Inserting record', record);
        return this.db.collection(collection).insertOne(record);
    }

    async _insertRecordsAsync(records, collection) {
        debug('Inserting record', records);
        return this.db.collection(collection).insertMany(records);
    }

    /**
     * Insert encryption public key data in cache
     * @param pubKeyData
     * @returns {Promise<void>}
     */
    async insertPubKeyDataInCache(pubKeyData) {
        pubKeyData._id = 'pubKeyData';
        await this._insertRecordAsync(pubKeyData, CACHE_COLLECTION);
    }

    /**
     * Fetch the pub key data from cache
     * @returns {Promise<EncryptionPubKey|null>}
     */
    async fetchPubKeyData() {
        const query = {_id: 'pubKeyData'};
        const pubKeyData = await this.db.collection(CACHE_COLLECTION).findOne(query);
        return (pubKeyData) ? pubKeyData : null;
    }

    /**
     * Insert Salad contract address in cache
     * @param {string} addr
     * @returns {Promise<void>}
     */
    async insertSmartContractAddress(addr) {
        const data = {_id: 'saladContractAddr', addr};
        await this._insertRecordAsync(data, CONFIG_COLLECTION);
    }

    /**
     * Insert Salad contract address in cache
     * @param {string} addr
     * @returns {Promise<void>}
     */
    async insertSecretContractAddress(addr) {
        const data = {_id: 'secretContractAddr', addr};
        await this._insertRecordAsync(data, CONFIG_COLLECTION);
    }

    /**
     * Fetch the Salad contract address from cache
     * @returns {Promise<string>}
     */
    async fetchSmartContractAddr() {
        const query = {_id: 'saladContractAddr'};
        const data = await this.db.collection(CONFIG_COLLECTION).findOne(query);
        return data.addr;
    }

    /**
     * Insert last mix block number in cache
     * @param {string} blockNumber
     * @returns {Promise<void>}
     */
    async insertLastMixBlockNumber(blockNumber) {
        const data = {_id: 'lastMixBlockNumber', blockNumber};
        await this._insertRecordAsync(data, CACHE_COLLECTION);
    }

    /**
     * Fetch the Salad contract address from cache
     * @returns {Promise<string>}
     */
    async fetchLastMixBlockNumber() {
        const query = {_id: 'lastMixBlockNumber'};
        const data = await this.db.collection(CACHE_COLLECTION).findOne(query);
        return (data) ? data.blockNumber : null;
    }

    /**
     * Fetch the Secret contract address from cache
     * @returns {Promise<string>}
     */
    async fetchSecretContractAddr() {
        const query = {_id: 'secretContractAddr'};
        const data = await this.db.collection(CONFIG_COLLECTION).findOne(query);
        return data.addr;
    }

    /**
     * Insert Deposit
     * @param {Deposit} deposit
     */
    async insertDepositAsync(deposit) {
        deposit.dealId = null;
        await this._insertRecordAsync(deposit, DEPOSITS_COLLECTION);
    }

    async discardDepositAsync(deposit) {
        const query = {dealId: null, sender: deposit.sender};
        const newValues = {$set: {dealId: 'discarded'}};
        await this.db.collection(DEPOSITS_COLLECTION).updateOne(query, newValues);
    }

    /**
     * Insert Deal
     * @param {Deal} deal
     */
    async insertDealAsync(deal) {
        const {dealId} = deal;
        deal._id = dealId;
        await this._insertRecordAsync(deal, DEALS_COLLECTION);
        const query = {dealId: null};
        const newValues = {$set: {dealId}};
        await this.db.collection(DEPOSITS_COLLECTION).updateMany(query, newValues);
    }

    async updateDealAsync(deal) {
        const query = {_id: deal.dealId};
        const record = {$set: {...deal}};
        await this.db.collection(DEALS_COLLECTION).updateOne(query, record);
    }

    async queryFillableDepositsAsync(minimumAmount) {
        const query = {dealId: null};
        const result = await this.db.collection(DEPOSITS_COLLECTION).find(query);
        return result.toArray();
    }

    async queryDealsAsync(status) {
        const query = {status};
        const result = await this.db.collection(DEALS_COLLECTION).find(query);
        return result.toArray();
    }

    /**
     * Find deposit by participant address
     * @returns {Deposit|null}
     */
    async getDepositAsync(dealId) {
        const query = {dealId};
        const result = await this.db.collection(DEPOSITS_COLLECTION).find(query);
        return result.toArray();
    }
}

module.exports = {Store, DEPOSITS_COLLECTION, DEALS_COLLECTION, CACHE_COLLECTION, CONFIG_COLLECTION};
