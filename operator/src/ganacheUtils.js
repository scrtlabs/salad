async function mineBlock(web3) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: new Date().getTime()
        }, (err, result) => {
            if (err) {
                return reject(err)
            }
            return resolve(result)
        });
    });
}

async function mineUntilDeal(web3, server) {
    let countdown;
    do {
        await mineBlock(web3);
        countdown = await server.refreshBlocksUntilDeal();
    } while (countdown > 0);
}

module.exports = {mineUntilDeal, mineBlock};