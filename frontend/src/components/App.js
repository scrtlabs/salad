// Imports - React
import React, {Component} from 'react';
// Imports - Redux
import connect from 'react-redux/es/connect/connect';
// Imports - Frameworks (Semantic-UI and Material-UI)
import {Container, Message} from 'semantic-ui-react';
import Grid from '@material-ui/core/Grid';
import {withStyles} from '@material-ui/core';
// Imports - Components
import Header from './Header';
import Mixer from './Mixer';
import Notifier from './Notifier';
// Imports - Actions (Redux)
import {initializeWeb3, initializeSalad} from '../actions';

import getWeb3 from '../utils/getWeb3';
import SaladContract from '../build/smart_contracts/Salad';
import {CoinjoinClient} from "@salad/client";
import EnigmaContract from "../build/enigma_contracts/Enigma";
import CircularProgress from "@material-ui/core/CircularProgress";

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
    constructor(props) {
        super(props);
        this.state = {
            isUnsupportedNetwork: null,
        };
    }

    async componentDidMount() {
        try {
            const web3 = await getWeb3();
            this.props.initializeWeb3(web3);
            // TODO: Bootstrap the operator url during build
            const salad = new CoinjoinClient( undefined, web3 );
            await salad.initAsync();
            this.props.initializeSalad(salad);
        } catch (e) {
            console.error(e);
            // TODO: Be more specific about the error
            this.setState({isUnsupportedNetwork: true});
        }

    }

    render() {
        if (!this.props.web3) {
            return (
                <div className="App">
                    <Header/>
                    <br/><br/><br/><br/>
                    <Grid container spacing={3}>
                        <Grid item xs={3}/>
                        <Grid item xs={6} style={{textAlign: 'center'}}>
                            <Message color="grey">Please allow account authorization in your MetaMask.</Message>
                        </Grid>
                    </Grid>
                </div>
            );
        } else if (!this.props.salad) {
            return (
                <div className="App">
                    <Header/>
                    <br/><br/><br/><br/>
                    <Grid container spacing={3}>
                        <Grid item xs={3}/>
                        <Grid item xs={6} style={{textAlign: 'center'}}>
                            <Message color="grey">
                                <p>Connecting to the Salad server</p>
                                <CircularProgress />
                            </Message>
                        </Grid>
                    </Grid>
                </div>
            );
        } else if (this.state.isUnsupportedNetwork) {
            const networks = {
                1: 'Mainnet',
                2: 'Morden',
                3: 'Ropsten',
                4: 'Rinkeby',
            };
            return (
                <div className="App">
                    <Header/>
                    <br/><br/><br/><br/>
                    <Grid container spacing={3}>
                        <Grid item xs={3}/>
                        <Grid item xs={6} style={{textAlign: 'center'}}>
                            <Message color="grey">
                                Network <b>{networks[this.props.web3.networkId] || this.props.web3.networkId}</b> is not
                                supported.<br/>
                                Please choose another one and refresh the page.
                            </Message>
                        </Grid>
                    </Grid>
                </div>
            );
        }
        const {blockCountdown, quorum, threshold} = this.props.salad;
        return (
            <div className="App">
                <Header/>
                <Notifier/>
                <br/><br/><br/><br/>
                <Container>
                    <Mixer
                        blockCountDown={blockCountdown}
                        quorum={quorum}
                        threshold={threshold}
                    />
                </Container>
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        web3: state.web3,
        salad: state.salad,
    }
};

export default connect(
    mapStateToProps,
    {initializeWeb3, initializeSalad}
)(withStyles(styles)(App));
