// Imports - React
import React, { Component } from 'react';
import PropTypes from 'prop-types';
// Imports - Frameworks (Semantic-UI and Material-UI)
import { withStyles } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';

const styles = () => ({
    root: {
        flexGrow: 1,
    }
});

class Header extends Component {
    render() {
        const { classes } = this.props;
        return (
            <div className={classes.root}>
                <AppBar position="static">
                    <Toolbar>
                        <Typography
                            variant="subtitle1"
                            color="inherit"
                        >
                            🥗 Salad
                        </Typography>
                    </Toolbar>
                </AppBar>
            </div>
        );
    }
}

Header.propTypes = {
    classes: PropTypes.object.isRequired
};

export default withStyles(styles)(Header);
