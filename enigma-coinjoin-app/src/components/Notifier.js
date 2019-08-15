// Imports - React
import React, { Component } from 'react';
// Imports - Redux
import connect from 'react-redux/es/connect/connect';
// Imports - Frameworks (Material-UI)
import Snackbar from '@material-ui/core/Snackbar';
// Imports - Actions (Redux)
import { notifyMessage} from '../actions';

let openSnackbarFn;

class Notifier extends Component {
    componentDidMount() {
        openSnackbarFn = this.openSnackbar;
    }

    openSnackbar = ({ message }) => {
        this.props.notifyMessage({open: true, message});
    };

    handleSnackbarClose = () => {
        this.props.notifyMessage({open: false, message: ''});
    };

    render() {
        const message = (
            <span
                id="snackbar-message-id"
                dangerouslySetInnerHTML={{ __html: this.props.notification.message }}
            />
        );

        return (
            <Snackbar
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                message={message}
                autoHideDuration={3000}
                onClose={this.handleSnackbarClose}
                open={this.props.notification.open}
                ContentProps={{
                    "aria-describedby": "snackbar-message-id"
                }}
            />
        );
    }
}

export function openSnackbar({ message }) {
    openSnackbarFn({ message });
}

const mapStateToProps = (state) => {
    return {
        notification: state.notification,
    }
};

export default connect(mapStateToProps, { notifyMessage })(Notifier);
