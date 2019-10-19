export const initializeWeb3 = (web3) => {
    return {
        type: 'WEB3_INITIALIZED',
        payload: web3
    };
};

export const initializeAccounts = (accounts) => {
    return {
        type: 'ACCOUNTS_INITIALIZED',
        payload: accounts
    };
};

export const notifyMessage = (notification) => {
    return {
        type: 'MESSAGE_NOTIFIED',
        payload: notification
    };
};
