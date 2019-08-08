const {Db, MongoClient} = require('mongodb');

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

    async updateTaskRecordAsync(taskRecord) {
        const query = {_id: taskRecord._id};
        delete taskRecord._id;
        const record = {$set: {...taskRecord}};
        const result = await this.db.collection('tasks').updateOne(query, record);
        // console.log('Updated Task record', result);
        return result;
    }
}

module.exports = {Store};
