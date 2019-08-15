// Imports - React
import React, { Component } from 'react';
// Imports - Redux
import connect from 'react-redux/es/connect/connect';
// Imports - Frameworks (Semantic-UI and Material-UI)
import { Container, Message } from 'semantic-ui-react';
import Paper from '@material-ui/core/Paper';
import Grid from '@material-ui/core/Grid';
import { withStyles } from '@material-ui/core';
// Imports - Components
import Header from './Header';
import Mixer from './Mixer';
import Notifier from './Notifier';
// Imports - Actions (Redux)
import { initializeWeb3, initializeAccounts } from '../actions';

import getWeb3 from '../utils/getWeb3';

const styles = theme => ({
    root: {
        flexGrow: 1,
    },
    paper: {
        padding: theme.spacing(2),
        textAlign: 'center',
        color: theme.palette.text.secondary,
    },
});

class App extends Component {
    async componentDidMount() {
        const web3 = await getWeb3();
        const accounts = await web3.eth.getAccounts();
        this.props.initializeWeb3(web3);
        this.props.initializeAccounts(accounts);
    }

    render() {
        if (!this.props.web3) {
            return (
                <div className="App">
                    <Header/>
                    <br />
                    <br />
                    <Grid container spacing={3}>
                        <Grid item xs={3} />
                        <Grid item xs={6}>
                            <Message color="grey">Please allow account authorization in your MetaMask...</Message>
                        </Grid>
                    </Grid>
                </div>
            );
        }
        else {
            return (
                <div className="App">
                    <Header/>
                    <Notifier />
                    <br />
                    <br />
                    <Container>
                        <Paper style={{ padding: '30px' }}>
                            <Mixer />
                        </Paper>
                    </Container>
                </div>
            );
        }
    }
}

const mapStateToProps = (state) => {
    return {
        web3: state.web3,
    }
};

export default connect(
    mapStateToProps,
    { initializeWeb3, initializeAccounts }
)(withStyles(styles)(App));
