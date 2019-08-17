import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Field, reduxForm, SubmissionError } from 'redux-form';
import { CoinjoinClient, actions } from 'enigma-coinjoin-client';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl/FormControl';
import InputLabel from '@material-ui/core/InputLabel/InputLabel';
import Select from '@material-ui/core/Select/Select';
import FormHelperText from '@material-ui/core/FormHelperText';
import TextField from '@material-ui/core/TextField/TextField';
import LinearProgress from '@material-ui/core/LinearProgress';

import { openSnackbar } from './Notifier';
import MixerContract from '../build/smart_contracts/Mixer';

class Mixer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isSubmitting: false,
      isPending: false,
      page: 0,
      pubKey: null,
      quorum: 0,
      threshold: 0,
    };
    const contractAddr = MixerContract.networks[4447].address; // TODO hardcoded network id
    this.service = new CoinjoinClient(contractAddr, undefined, this.props.web3);

    this.service.onPubKey(({ payload }) => {
      console.log('pubKey', payload);
      this.setState({ pubKey: payload });
    });
    this.service.onThresholdValue(({ payload }) => {
      this.setState({ threshold: payload });
    });
    this.service.onQuorumValue(({ payload }) => {
      this.setState({ quorum: payload });
    });
    this.service.ee.on(actions.SUBMIT_DEPOSIT_METADATA_SUCCESS, () => {
      openSnackbar({ message: 'Your deposit was included in a pending deal.' });
      this.setState({ isSubmitting: false, isPending: true });
    });
    this.service.onDealExecuted(() => {
      if (!this.state.isPending) {
        return;
      }
      openSnackbar({
        message: 'Your deposit was included in an executed deal.'
      });
      this.setState({ isPending: false });
    });

    // noinspection JSIgnoredPromiseFromCall
    this.service.initAsync();
  }

  // Redux form/material-ui render address select component
  static renderAddressInput({input, label, meta: { touched, error }, children, ...custom }) {
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
  static renderStringInput({label, input, meta: { touched, invalid, error }, ...custom }) {
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

  onSubmit = async ({ sender, recipient, amount }) => {
    if (!this.props.web3.utils.isAddress(recipient)) {
      throw new SubmissionError({ recipient: 'Invalid address' });
    }
    console.log('Submitted:', sender, recipient, amount);
    this.setState({ isSubmitting: true });
    await this.service.makeDepositAsync(sender, amount);
    const encRecipient = await this.service.encryptRecipientAsync(recipient);
    await this.service.submitDepositMetadataAsync(sender, amount, this.state.pubKey, encRecipient);
  };

  render() {
    const { isSubmitting, quorum, threshold, page } = this.state;
    if (page === 0) {
      return (
        <Grid container spacing={3}>
          <Grid item xs={2}/>
          <Grid item xs={8}>
            <Paper style={{ padding: '30px' }}>
              <p style={{ fontSize: '18px' }} align="center">
                <span role="img" aria-label="Salad">🥗</span> Salad – It's Good for You!
              </p>
              <p>
                Salad is a non-interactive, non-custodial Coin Join implementation,
                built with
                <a href="https://enigma.co" target="_blank" rel="noopener noreferrer">Enigma</a>.
              </p>
              <br />
              <p>
                To use Salad, you'll need:<br />
                1. The address holding the tokens you'd like to mix.<br />
                2. The address you'd like the mixed coins send to.
              </p>
              <br />
              <p align="center">
                <Button
                  variant='outlined'
                  onClick={() => this.setState({ page: 1 })}
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
          <Grid item xs={2}/>
          <Grid item xs={8}>
            <Paper style={{ padding: '30px' }}>
              <p style={{ fontSize: '18px' }} align="center">
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
              <br />
              <p align="center">
                <Button
                  variant='outlined'
                  onClick={() => this.setState({ page: 2 })}
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
      <Paper style={{ padding: '30px' }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <div>
              <form onSubmit={this.props.handleSubmit(this.onSubmit)}>
                <div>
                  <InputLabel htmlFor="sender">Sender Address</InputLabel>
                  <Field
                    name="sender"
                    component={Mixer.renderAddressInput}
                  >
                    <option value="" />
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
                  />
                </div>
                <div>
                  <div style={{ float: 'left', fontSize: '16px', paddingTop: '10px' }}>
                    { threshold === 0 ? 'Loading...' : (
                      <span>Progress: <b>{ quorum } / { threshold }</b></span>
                    )}
                  </div>
                  <div style={{ float: 'right' }}>
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
            </div>
          </Grid>
          <Grid item xs={12}>
            <LinearProgress variant="determinate" value={Math.ceil(quorum / threshold * 100)} />
          </Grid>
        </Grid>
      </Paper>
    )
  }
}
const mapStateToProps = (state) => {
  return {
    web3: state.web3,
    accounts: state.accounts,
  }
};
export default connect(mapStateToProps)(reduxForm({
  form: 'mix',
})(Mixer));