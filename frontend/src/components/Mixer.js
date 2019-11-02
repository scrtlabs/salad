import React, {Component} from 'react';
import {connect} from 'react-redux';
import {Field, reduxForm, SubmissionError} from 'redux-form';
import {CoinjoinClient, actions} from '@salad/client';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';
import Button from '@material-ui/core/Button';
import Fab from '@material-ui/core/Fab';
import ArrowLeftIcon from '@material-ui/icons/KeyboardArrowLeft';
import FormControl from '@material-ui/core/FormControl/FormControl';
import InputLabel from '@material-ui/core/InputLabel/InputLabel';
import Select from '@material-ui/core/Select/Select';
import FormHelperText from '@material-ui/core/FormHelperText';
import TextField from '@material-ui/core/TextField/TextField';
import LinearProgress from '@material-ui/core/LinearProgress';

import {openSnackbar} from './Notifier';
import SaladContract from '../build/smart_contracts/Salad';
import EnigmaContract from '../build/enigma_contracts/Enigma';

const DEPOSIT_AMOUNT = 0.01;

class Mixer extends Component {
    constructor(props) {
        super(props);
        this.service = new CoinjoinClient(
            SaladContract.networks[props.web3.networkId].address,
            EnigmaContract.networks[props.web3.networkId].address,
            undefined,
            props.web3
        );
        this.state = {
            isSubmitting: false,
            isPending: false,
            page: 0,
            blockCountdown: this.service.blockCountdown,
            pubKey: this.service.pubKey,
            quorum: this.service.quorum,
            threshold: this.service.threshold,
        };

        this.service.onBlock((payload) => {
            console.log('Got block countdown update', payload);
            const {blockCountdown} = payload;
            this.setState({blockCountdown});
        });
        this.service.onPubKey((payload) => {
            console.log('Got pubKey', payload);
            const {pubKey} = payload;
            this.setState({pubKey});
        });
        this.service.onThresholdValue((payload) => {
            console.log('Got threshold', payload);
            const {threshold} = payload;
            this.setState({threshold});
        });
        this.service.onQuorumValue((payload) => {
            console.log('Got quorum', payload);
            const {quorum} = this.service;
            this.setState({quorum});
        });
        this.service.ee.on(actions.SUBMIT_DEPOSIT_METADATA_SUCCESS, () => {
            openSnackbar({message: 'Your deposit was included in a pending deal.'});
            this.setState({isSubmitting: false, isPending: true});
            props.reset('mix');
        });
        this.service.onDealCreated((payload) => {
            if (!this.state.isPending) {
                return;
            }
            const {deal} = payload;
            openSnackbar({
                message: `Your deposit was included in deal: ${deal.dealId}.`
            });
        });
        this.service.onDealExecuted((payload) => {
            if (!this.state.isPending) {
                return;
            }
            const {deal} = payload;
            openSnackbar({
                message: `Your deposit was included in executed deal: ${deal.dealId}.`
            });
            this.setState({isPending: false});
        });

        (async () => {
            await this.service.initAsync();
            console.log('Connected to WS');
        })();
    }

    // Redux form/material-ui render address select component
    static renderAddressInput({input, label, meta: {touched, error}, children, ...custom}) {
        return (
            <div>
                <FormControl error={touched && error} fullWidth>
                    <Select
                        native
                        {...input}
                        {...custom}
                        inputProps={{
                            name: 'sender',
                            id: 'sender'
                        }}
                        required
                    >
                        {children}
                    </Select>
                    <FormHelperText>Current address holding tokens</FormHelperText>
                </FormControl>
            </div>

        )
    }

    // Redux form/material-ui render text field component
    static renderStringInput({label, input, meta: {touched, invalid, error}, ...custom}) {
        console.log('The input', input);
        return (
            <TextField
                label={label}
                type="text"
                placeholder={label}
                error={touched && invalid}
                helperText={touched && error}
                {...input}
                {...custom}
                fullWidth
            />
        )
    }

    onSubmit = async ({sender, recipient, amount}) => {
        if (!this.props.web3.utils.isAddress(recipient)) {
            throw new SubmissionError({recipient: 'Invalid address'});
        }
        console.log('Submitted:', sender, recipient, amount);
        this.setState({isSubmitting: true});
        const amountInWei = this.props.web3.utils.toWei(amount);
        await this.service.makeDepositAsync(sender, amountInWei);
        const encRecipient = await this.service.encryptRecipientAsync(recipient);
        // The public key of the user must be submitted
        // This is DH encryption, Enigma needs the user pub key to decrypt the data
        const myPubKey = this.service.keyPair.publicKey;
        // TODO: Add signature
        await this.service.submitDepositMetadataAsync(sender, amountInWei, encRecipient, myPubKey);
    };

    // async componentDidMount() {
    //     fetch('https://api.mydomain.com')
    //         .then(response => response.json())
    //         .then(data => this.setState({ data }));
    // }

    render() {
        const {isSubmitting, quorum, threshold, page, blockCountdown} = this.state;
        if (page === 0) {
            return (
                <Grid container spacing={3}>
                    <Grid item xs={2}/>
                    <Grid item xs={8}>
                        <Paper style={{padding: '30px'}}>
                            <p style={{fontSize: '18px'}} align="center">
                                <span role="img" aria-label="Salad">🥗</span> Salad – It's Good for You!
                            </p>
                            <p>
                                Salad is a non-interactive, non-custodial Coin Join implementation,
                                built with <a href="https://enigma.co" target="_blank"
                                              rel="noopener noreferrer">Enigma</a>.
                            </p>
                            <br/>
                            <p>
                                To use Salad, you'll need:<br/>
                                1. The address holding the tokens you'd like to mix.<br/>
                                2. The address you'd like the mixed coins send to.
                            </p>
                            <br/>
                            <p align="center">
                                <Button
                                    variant='outlined'
                                    onClick={() => this.setState({page: 1})}
                                    color='secondary'>
                                    OK, Got it!
                                </Button>
                            </p>
                        </Paper>
                    </Grid>
                </Grid>
            );
        }
        if (page === 1) {
            return (
                <Grid container spacing={3}>
                    <Grid item xs={1} style={{display: 'flex', alignItems: 'center'}}>
                        <Fab size="small" aria-label="add" onClick={() => this.setState({page: 0})}>
                            <ArrowLeftIcon/>
                        </Fab>
                    </Grid>
                    <Grid item xs={1}/>
                    <Grid item xs={8}>
                        <Paper style={{padding: '30px'}}>
                            <p style={{fontSize: '18px'}} align="center">
                                <span role="img" aria-label="Salad">🥗</span> Salad – It's Good for You!
                            </p>
                            <p>
                                Before you start &mdash;
                            </p>
                            <p>
                                Salad requires both a quorum (a minimum number of participants) and a time threshold.
                            </p>
                            <p>
                                When a quorum is met, and the time threshold is passed, the mix will occur.
                            </p>
                            <br/>
                            <p align="center">
                                <Button
                                    variant='outlined'
                                    onClick={() => this.setState({page: 2})}
                                    color='secondary'>
                                    Ready to Make Salad!
                                </Button>
                            </p>
                        </Paper>
                    </Grid>
                </Grid>
            );
        }
        return (
            <Grid container spacing={3}>
                <Grid item xs={2} style={{display: 'flex', alignItems: 'center'}}>
                    <Fab size="small" aria-label="back" onClick={() => this.setState({page: 1})}>
                        <ArrowLeftIcon/>
                    </Fab>
                </Grid>
                <Grid item xs={8}>
                    <Paper style={{padding: '30px'}}>
                        <form onSubmit={this.props.handleSubmit(this.onSubmit)}>
                            <div>
                                <InputLabel htmlFor="sender">Sender Address</InputLabel>
                                <Field
                                    name="sender"
                                    component={Mixer.renderAddressInput}
                                >
                                    <option value=""/>
                                    {this.props.accounts.map((account, i) => {
                                        return (
                                            <option key={i} value={account}>{account}</option>
                                        );
                                    })}
                                </Field>
                            </div>
                            <div>
                                <Field
                                    name="recipient"
                                    component={Mixer.renderStringInput}
                                    label="Recipient Address"
                                    required
                                    helperText="Where you want the tokens sent, after mixing"
                                />
                            </div>
                            <div>
                                <Field
                                    name="amount"
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    component={Mixer.renderStringInput}
                                    label="Amount"
                                    helperText="Total tokens you're submitting to be mixed"
                                    required
                                    disabled
                                />
                            </div>
                            <div>
                                <div style={{float: 'left', fontSize: '16px', paddingTop: '10px'}}>
                                    <span>Progress: <b>{quorum} / {threshold}</b></span>
                                </div>
                                <div style={{float: 'right'}}>
                                    <Button
                                        variant='outlined'
                                        type='submit'
                                        disabled={isSubmitting}
                                        color='secondary'>
                                        {isSubmitting ? 'Pending...' : 'Submit'}
                                    </Button>
                                </div>
                            </div>
                        </form>
                        <p>&nbsp;</p>
                        <p>&nbsp;</p>
                        <LinearProgress variant="determinate" value={Math.ceil(quorum / threshold * 100)}/>
                        <div style={{fontSize: '16px', paddingTop: '20px'}}>
                            <span>Dealing in <b>{blockCountdown}</b> blocks</span>
                        </div>
                    </Paper>
                </Grid>
            </Grid>
        )
    }
}

const mapStateToProps = (state) => {
    return {
        initialValues: {
            amount: DEPOSIT_AMOUNT.toString(),
        },
        web3: state.web3,
        accounts: state.accounts,
    }
};
export default connect(mapStateToProps)(reduxForm({
    form: 'mix',
})(Mixer));
