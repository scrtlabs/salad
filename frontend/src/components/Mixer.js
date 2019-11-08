import React, {Component} from 'react';
import {connect} from 'react-redux';
import {Field, reduxForm, SubmissionError} from 'redux-form';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';
import Button from '@material-ui/core/Button';
import Fab from '@material-ui/core/Fab';
import ArrowLeftIcon from '@material-ui/icons/KeyboardArrowLeft';
import FormControl from '@material-ui/core/FormControl/FormControl';
import Select from '@material-ui/core/Select/Select';
import FormHelperText from '@material-ui/core/FormHelperText';
import TextField from '@material-ui/core/TextField/TextField';
import LinearProgress from '@material-ui/core/LinearProgress';
import {initializeSalad} from "../actions";

import {openSnackbar} from './Notifier';

const DEPOSIT_AMOUNT = 0.01;

class Mixer extends Component {
    constructor(props) {
        super(props);
        const {blockCountdown, quorum, threshold} = props;
        this.state = {
            isSubmitting: false,
            isPending: false,
            page: 0,
            blockCountdown,
            quorum,
            threshold,
            err: null,
            deal: null,
        };
    }

    // Redux form/material-ui render address select component
    static renderAddressInput({input, label, meta: {touched, error}, children, ...custom}) {
        return (
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
        const {web3, salad} = this.props;
        if (!web3.utils.isAddress(recipient)) {
            throw new SubmissionError({recipient: 'Invalid address'});
        }
        console.log('Submitted:', sender, recipient, amount);
        this.setState({isSubmitting: true});
        try {
            const amountInWei = web3.utils.toWei(amount);
            const depositReceipt = await salad.makeDepositAsync(sender, amountInWei);
            openSnackbar({message: `Deposit made with tx: ${depositReceipt.transactionHash}`});
            console.log('Deposit made', depositReceipt);
            console.log('Encrypting recipient', recipient);
            const encRecipient = await salad.encryptRecipientAsync(recipient);
            console.log('The encrypted recipient');
            const myPubKey = salad.keyPair.publicKey;
            console.log('Signing deposit payload', sender, amountInWei, encRecipient, myPubKey);
            const signature = await salad.signDepositMetadataAsync(sender, amountInWei, encRecipient, myPubKey);
            console.log('Deposit payload signed', signature);
            // The public key of the user must be submitted
            // This is DH encryption, Enigma needs the user pub key to decrypt the data
            await salad.submitDepositMetadataAsync(sender, amountInWei, encRecipient, myPubKey, signature);
            console.log('Deposit metadata submitted');
            openSnackbar({message: 'Deposit accepted by the Relayer'});
            this.setState({isSubmitting: false, isPending: true});
            this.props.reset('mix');
        } catch (e) {
            openSnackbar({message: `Error with your deposit: ${e.message}`});
            console.error('Unable to make deposit', e);
            this.setState({err: e});
            debugger;
        }
    };

    async componentDidMount() {
        const {salad} = this.props;
        salad.onBlock((payload) => {
            console.log('Got block countdown update', payload);
            const {blockCountdown} = payload;
            this.setState({blockCountdown});
        });
        salad.onThresholdValue((payload) => {
            console.log('Got threshold', payload);
            const {threshold} = payload;
            this.setState({threshold});
        });
        salad.onQuorumValue((payload) => {
            console.log('Got quorum', payload);
            const {quorum} = payload;
            this.setState({quorum});
        });
        salad.onDealCreated((payload) => {
            const {deal} = payload;
            if (deal.participants.indexOf(salad.accounts[0]) !== -1) {
                this.setState({deal, isPending: true});
            }
        });
        salad.onDealExecuted((payload) => {
            const {deal} = payload;
            this.setState({deal, isPending: false});
        });
    }

    render() {
        const {isSubmitting, quorum, threshold, page, blockCountdown, err} = this.state;
        if (err !== null) {
            return (
                <Grid container spacing={3}>
                    <Grid item xs={2}/>
                    <Grid item xs={8}>
                        <Paper style={{padding: '30px'}}>
                            <p style={{fontSize: '18px'}} align="center">Sorry, something bad happened.</p>
                            <p align="center"> {err.message || err} </p>
                            <p align="center">Please refresh and try again.</p>
                        </Paper>
                    </Grid>
                </Grid>
            )
        } else if (page === 0) {
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
        } else if (page === 1) {
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
        } else if (this.state.deal !== null) {
            const {web3} = this.props;
            const {deal, isPending} = this.state;
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
                            <p>
                                Your deposit was included in <b>{(isPending) ? 'Pending' : 'Executed'}</b> Deal.
                            </p>
                            <p>
                                The anonymity set is <b>{deal.participants.length}</b>.
                            </p>
                            <p>
                                {web3.utils.fromWei(deal.depositAmount, 'ether')} ETH {(isPending) ? 'will be' : 'have been'} transferred to you recipient account.
                            </p>
                            <p>
                                Deal Id <b>{deal.dealId}</b>
                            </p>
                            <br/>
                            <p align="center">
                                <Button
                                    variant='outlined'
                                    onClick={() => this.setState({deal: null})}
                                    color='secondary'>
                                    Okay
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
                                <Field
                                    name="sender"
                                    component={Mixer.renderStringInput}
                                    label="Sender Address"
                                    required
                                    disabled
                                    helperText="Current address holding tokens"
                                />
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
    console.log('Mapping state to props', state);
    const {web3, salad} = state;
    return {
        initialValues: {
            amount: DEPOSIT_AMOUNT.toString(),
            sender: salad.accounts[0],
        },
        web3,
        salad,
    }
};
export default connect(mapStateToProps, {load: initializeSalad})(reduxForm({
    form: 'mix',
})(Mixer));
