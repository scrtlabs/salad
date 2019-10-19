const {Db, MongoClient} = require('mongodb');
const debug = require('debug')('operator-store');

const DEPOSITS_COLLECTION = 'deposits';
const DEALS_COLLECTION = 'deals';
const CACHE_COLLECTION = 'cache';

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
     * Insert Deposit
     * @param {Deposit} deposit
     */
    async insertDepositAsync(deposit) {
        deposit.dealId = null;
        await this._insertRecordAsync(deposit, DEPOSITS_COLLECTION);
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

module.exports = {Store, DEPOSITS_COLLECTION, DEALS_COLLECTION, CACHE_COLLECTION};
