// Imports - React
import React, { Component } from 'react';
// Imports - Redux
import { connect } from 'react-redux';
import { Field, reduxForm } from 'redux-form';
// Imports - Frameworks (Semantic-UI and Material-UI)
import Grid from '@material-ui/core/Grid';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl/FormControl';
import InputLabel from '@material-ui/core/InputLabel/InputLabel';
import Select from '@material-ui/core/Select/Select';
import TextField from '@material-ui/core/TextField/TextField';
// Imports - Components
import Notifier from './Notifier';

class Mixer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isPending: false
    };
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
              name: 'ownerAddress',
              id: 'owner-address'
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

  render() {
    return (
      <div>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <div>
              <Notifier />
              <h4>Mix Coins</h4>
              <form>
                <div>
                  <InputLabel htmlFor="owner-address">Address *</InputLabel>
                  <Field
                    name="ownerAddress"
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
                <br />
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
    enigma: state.enigma,
    accounts: state.accounts,
  }
};
export default connect(mapStateToProps)(reduxForm({
  form: 'mix',
})(Mixer));
