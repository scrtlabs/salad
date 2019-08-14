// Imports - React
import React, { Component } from 'react';
// Imports - Redux
import { connect } from 'react-redux';
import { Field, reduxForm, SubmissionError } from 'redux-form';
// import { CoinjoinClient, actions } from 'enigma-coinjoin-client';
// Imports - Frameworks (Semantic-UI and Material-UI)
import Grid from '@material-ui/core/Grid';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl/FormControl';
import InputLabel from '@material-ui/core/InputLabel/InputLabel';
import Select from '@material-ui/core/Select/Select';
import TextField from '@material-ui/core/TextField/TextField';
import LinearProgress from '@material-ui/core/LinearProgress';
// Imports - Components
import Notifier, { openSnackbar } from './Notifier';

class Mixer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isSubmitting: false,
      isPending: false,
      quorum: 0,
      threshold: 0,
    };
    // this.service = new CoinjoinClient(0, undefined, web3);
    // this.service.initAsync();
    // this.service.onThresholdValue(({ payload }) => {
    //   this.setState({ threshold: payload });
    // });
    // this.service.onQuorumValue(({ payload }) => {
    //   this.setState({ quorum: payload });
    // });
    // this.service.ee.on(actions.SUBMIT_DEPOSIT_METADATA_SUCCESS, () => {
    //   openSnackbar({ message: 'Your deposit was included in a pending deal.' });
    //   this.setState({ isSubmitting: false, isPending: true });
    // });
    // this.service.onDealExecuted(() => {
    //   if (!this.state.isPending) {
    //     return;
    //   }
    //   openSnackbar({
    //     message: 'Your deposit was included in an executed deal.'
    //   });
    //   this.setState({ isPending: false });
    // });

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
    console.log('hey', sender, recipient, amount);
    // this.setState({ isSubmitting: true });
    // await this.service.makeDepositAsync(sender, amount);
    // const encRecipient = await this.service.encryptRecipient(recipient);
    // await this.service.submitDepositMetadataAsync(sender, amount, encRecipient);
  };

  render() {
    const { isSubmitting, quorum, threshold } = this.state;
    return (
      <div>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <div>
              <Notifier />
              <h3>Mix Coins</h3>
              <form onSubmit={this.props.handleSubmit(this.onSubmit)}>
                <div>
                  <InputLabel htmlFor="sender">Sender *</InputLabel>
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
      </div>
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
