class MemoryStore {
    constructor() {
        /** @type Deposit[] */
        this.fillableDeposits = [];
        /** @type Deposit[] */
        this.deposits = [];
        /** @type Deal[] */
        this.deals = [];
    }

    initAsync() {
        console.log('Using an in-memory store');
        return new Promise((resolve) => {
            resolve(true);
        });
    }

    closeAsync() {
        console.log('Shutting down in-memory store');
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
        this.deposits.push({...deposit});
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

    /**
     * Find deposit by participant address
     * @param {string} participantAddress
     * @returns {Deposit|null}
     */
    getDeposit(participantAddress) {
        let deposit = null;
        for (const d of this.deposits) {
            if (d.sender === participantAddress) {
                deposit = d;
            }
        }
        return deposit;
    }
}

module.exports = {MemoryStore};