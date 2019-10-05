const {Db, MongoClient} = require('mongodb');

const DEPOSITS_COLLECTION = 'deposits';
const DEALS_COLLECTION = 'deals';

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
        console.log('Closing db connection');
        return this.client.close();
    }

    async truncate(collection) {
        console.log('Truncating collection', collection);
        const result = await this.db.collection(collection).deleteMany({});
        console.log('Truncated', result);
    }

    async findAllAsync(collection) {
        const result = await this.db.collection(collection).find({});
        return result.toArray();
    }

    async insertRecordAsync(record, collection) {
        console.log('Inserting record', record);
        const result = await this.db.collection(collection).insertOne(record);
        // console.log('Inserted record', result);
        return result;
    }

    async insertRecordsAsync(records, collection) {
        console.log('Inserting record', records);
        const result = await this.db.collection(collection).insertMany(records);
        // console.log('Inserted records', result);
        return result;
    }

    /**
     * Insert Deposit
     * @param {Deposit} deposit
     */
    async insertDepositAsync(deposit) {
        deposit.dealId = null;
        await this.insertRecordAsync(deposit, DEPOSITS_COLLECTION);
    }

    /**
     * Insert Deal
     * @param {Deal} deal
     */
    async insertDealAsync(deal) {
        const {dealId} = deal;
        deal._id = dealId;
        await this.insertRecordAsync(deal, DEALS_COLLECTION);
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

module.exports = {Store, DEPOSITS_COLLECTION, DEALS_COLLECTION};
