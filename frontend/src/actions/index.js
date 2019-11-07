export const initializeWeb3 = (web3) => {
    return {
        type: 'WEB3_INITIALIZED',
        payload: web3
    };
};

export const initializeSalad = (sender) => {
    return {
        type: 'SALAD_INITIALIZED',
        payload: sender,
    };
};

export const notifyMessage = (notification) => {
    return {
        type: 'MESSAGE_NOTIFIED',
        payload: notification
    };
};
