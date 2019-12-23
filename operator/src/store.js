const {MongoClient} = require('mongodb');
const debug = require('debug')('operator:store');

const DEPOSITS_COLLECTION = 'deposits';
const DEALS_COLLECTION = 'deals';
const CACHE_COLLECTION = 'cache';
const CONFIG_COLLECTION = 'config';

class Store {
    constructor() {
        this._url = process.env.MONGO_URL || 'mongodb://localhost:27017/';
        this._dbName = process.env.DB_NAME;
    }

    async initAsync() {
        this.client = await MongoClient.connect(this._url, { useUnifiedTopology: true });
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
     * Insert Enigma contract addresses in cache
     * @param {string} enigmaAddr
     * @param {string} enigmaTokenAddr
     * @returns {Promise<void>}
     */
    async insertEnigmaContractAddresses(enigmaAddr, enigmaTokenAddr) {
        const data = {_id: 'enigmaAddrs', addrs: {enigmaAddr, enigmaTokenAddr}};
        await this._insertRecordAsync(data, CONFIG_COLLECTION);
    }

    /**
     * Fetch the Enigma contract address from cache
     * @returns {Promise<Map<string,string>>}
     */
    async fetchEnigmaContractAddrs() {
        const query = {_id: 'enigmaAddrs'};
        const data = await this.db.collection(CONFIG_COLLECTION).findOne(query);
        return data.addrs;
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
    async setLastMixBlockNumber(blockNumber) {
        const query = {_id: 'lastMixBlockNumber'};
        let data = await this.db.collection(CACHE_COLLECTION).findOne(query);
        if (data) {
            const newValues = {$set: {blockNumber}};
            await this.db.collection(CACHE_COLLECTION).updateOne(query, newValues);
        } else {
            data = {_id: 'lastMixBlockNumber', blockNumber};
            await this._insertRecordAsync(data, CACHE_COLLECTION);
        }
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
        const result = await this.db.collection(DEPOSITS_COLLECTION).updateOne(query, newValues);
        debug('Discarded deposit', result);
    }

    /**
     * Insert Deal
     * @param {Deal} deal
     * @param {Array<string>} participants
     */
    async insertDealAsync(deal, participants) {
        const {dealId} = deal;
        deal._id = dealId;
        await this._insertRecordAsync(deal, DEALS_COLLECTION);
        const query = {dealId: null, sender: {$in: participants}};
        const newValues = {$set: {dealId}};
        const result = await this.db.collection(DEPOSITS_COLLECTION).updateMany(query, newValues);
        if (result.modifiedCount !== participants.length) {
            throw new Error(`Mismatching number of modified deposits: ${result.modifiedCount} !== ${participants.length}`);
        }
    }

    /**
     * Update the deal document by dealId
     * @param deal
     * @returns {Promise<void>}
     */
    async updateDealAsync(deal) {
        const query = {_id: deal.dealId};
        const record = {$set: {...deal}};
        await this.db.collection(DEALS_COLLECTION).updateOne(query, record);
    }

    /**
     * Query the fillable deposits (not yet assigned to deals)
     * @param minimumAmount
     * @returns {Promise<*>}
     */
    async queryFillableDepositsAsync(minimumAmount) {
        // TODO: Implement minimum deposit filter
        const query = {dealId: null};
        const result = await this.db.collection(DEPOSITS_COLLECTION).find(query);
        return result.toArray();
    }

    /**
     * Query Deals filtered by status code
     * @param status
     * @returns {Promise<Array<Deal>>}
     */
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
