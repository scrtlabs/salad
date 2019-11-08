import { combineReducers} from 'redux';
import { reducer as formReducer } from 'redux-form';

const initializeWeb3Reducer = (web3 = null, action) => {
    if (action.type === 'WEB3_INITIALIZED') {
        return action.payload;
    }

    return web3;
};

const initializeSaladReducer = (salad = null, action) => {
    if (action.type === 'SALAD_INITIALIZED') {
        return action.payload;
    }

    return salad;
};

const notifyMessageReducer = (notification = {open: false, message: ''}, action) => {
    if (action.type === 'MESSAGE_NOTIFIED') {
        return action.payload;
    }

    return notification;
};

export default combineReducers({
    web3: initializeWeb3Reducer,
    salad: initializeSaladReducer,
    notification: notifyMessageReducer,
    form: formReducer
});
