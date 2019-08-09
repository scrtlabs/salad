
class MemoryStore {
    constructor() {
        this.fillableDeposits = [];
        this.pendingDeals = [];
    }

    initAsync() {
        console.log('Using an in-memory store');
        return new Promise((resolve) => {
            resolve(true);
        });
    }

    insertDeposit(deposit) {
        this.fillableDeposits.push(deposit);
    }

    insertDeal(dealId, deposits) {
        for (let i =0; i<this.fillableDeposits.length; i++) {
            if (deposits.includes(this.fillableDeposits[i])) {
                this.fillableDeposits.splice(i, 1);
            }
        }
        const deal = {dealId, deposits};
        this.pendingDeals.push(deal);
    }

    updateDealActive(dealId) {

    }

    updateDealExecuted(dealId) {

    }

    queryFillableDeposits(minimumAmount) {
        return this.fillableDeposits;
    }
}

module.exports = {MemoryStore};