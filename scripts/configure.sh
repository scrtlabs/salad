#!/usr/bin/env bash
# This script sets up the configuration files for salad.
# By default, it configures it to run on SGX Hardware mode, but this can be overriden by passing `SGX_MODE=SW`
# to the script, which then configures salad to run on Simulation (Software) mode.

set -e

# Set SGX_MODE to HW if it's empty or null.
SGX_MODE="${SGX_MODE:="HW"}"

ENV_TEMPLATE=".env.template"
DOCKER_COMPOSE_TEMPLATE="docker-compose.template.yml"

if [[ $SGX_MODE != 'HW' && $SGX_MODE != 'SW' ]]
then
    printf 'SGX_MODE must be set to either SW or HW (default), not "%q"\n' "$SGX_MODE"
    exit 1
fi

# This function just prints a screen-wide line of '=' characters
print_line_of() {
    local char="$1"
    seq "-s$char" "$(tput cols)" | tr -d '[:digit:]'
}

print_line_of '='
echo 'configuring with:'
echo "SGX_MODE = $SGX_MODE"
print_line_of '='

cp "$ENV_TEMPLATE" '.env'
cp "$DOCKER_COMPOSE_TEMPLATE" 'docker-compose.yml'

# Edit the configuration files to work well with Simulation mode.
# All this does is replace a few well known configuration values to their simulation mode counterparts.
if [[ $SGX_MODE == 'SW' ]]
then
    sed -i -e 's/SGX_MODE=HW/SGX_MODE=SW/g' '.env'
    sed -i \
        -e 's/enigma_core_hw/enigma_core_sw/g' \
        -e 's/enigma_km_hw/enigma_km_sw/g' \
        'docker-compose.yml'
fi

yarn install
yarn dc pull
