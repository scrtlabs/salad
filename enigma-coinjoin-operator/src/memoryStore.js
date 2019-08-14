class MemoryStore {
    constructor() {
        this.fillableDeposits = [];
        this.deals = [];
    }

    initAsync() {
        console.log('Using an in-memory store');
        return new Promise((resolve) => {
            resolve(true);
        });
    }

    /**
     * Insert Deposit
     * @param {Deposit} deposit
     */
    insertDeposit(deposit) {
        this.fillableDeposits.push(deposit);
    }

    /**
     * Insert Deal
     * @param {Deal} deal
     */
    insertDeal(deal) {
        this.deals.push(deal);
    }

    setDealExecutable(deal) {
        this.fillableDeposits = [];
    }

    queryFillableDeposits(minimumAmount) {
        return this.fillableDeposits;
    }
}

module.exports = {MemoryStore};