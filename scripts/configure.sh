#!/usr/bin/env bash
# This script sets up the configuration files for salad.
# By default, it configures it to run on SGX Hardware mode, but this can be overriden by passing `SGX_MODE=SW`
# to the script, which then configures salad to run on Simulation (Software) mode.

set -e

# Set SGX_MODE to HW if it's empty or null.
SGX_MODE="${SGX_MODE:="HW"}"

if [[ $SGX_MODE != 'HW' && $SGX_MODE != 'SW' ]]
then
    printf 'SGX_MODE must be set to either SW or HW (default), not "%q"\n' "$SGX_MODE"
    exit 1
fi

echo 'configuring with:'
echo "SGX_MODE = $SGX_MODE"

cp '.env.template' '.env'
cp 'operator/.env.template' 'operator/.env'

# Edit the configuration files to work well with Simulation mode.
if [[ $SGX_MODE == 'SW' ]]
then
    cp 'docker-compose.cli-sw.yml' 'docker-compose.yml'
    sed -i -e 's/SGX_MODE=HW/SGX_MODE=SW/g' '.env'
else  # SGX_MODE must be HW
    cp 'docker-compose.cli-hw.yml' 'docker-compose.yml'
fi
