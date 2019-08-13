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
// Imports - Components
import Notifier, { openSnackbar } from './Notifier';

class Mixer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isPending: false
    };
    // this.service = new CoinjoinClient(0, undefined, web3);
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
    // this.setState({ isPending: true });
    // this.service.ee.on(actions.SUBMIT_DEPOSIT_METADATA_SUCCESS, () => {
    //   openSnackbar({ message: 'Deposit has been successfully submitted!' });
    //   this.setState({ isPending: false });
    // });
    // await this.service.initAsync();
    // await this.service.makeDepositAsync(sender, amount);
    // const encRecipient = await this.service.encryptRecipient(recipient);
    // await this.service.submitDepositMetadataAsync(sender, amount, encRecipient);
  };

  render() {
    return (
      <div>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <div>
              <Notifier />
              <h4>Mix Coins</h4>
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
                  <Button
                    variant='outlined'
                    type='submit'
                    disabled={this.state.isPending}
                    color='secondary'>
                    {this.state.isPending ? 'Pending...' : 'Submit'}
                  </Button>
                </div>
              </form>
            </div>
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
