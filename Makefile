SGX_MODE ?= HW
ifeq ($(SGX_MODE), HW)
else ifeq ($(SGX_MODE), SW)
else
$(error SGX_MODE must be either HW or SW)
endif

ENV_TEMPLATE := .env.template
DOCKER_COMPOSE_TEMPLATE := docker-compose.template.yml

.PHONY: configure
configure: report-environment
	cp $(ENV_TEMPLATE) .env
	cp $(DOCKER_COMPOSE_TEMPLATE) docker-compose.yml

# Edit the configuration files to work well with Simulation mode.
# All this does is replace a few well known configuration values to their simulation mode counterparts.
ifeq ($(SGX_MODE), SW)
	sed -i 's/SGX_MODE=HW/SGX_MODE=SW/g' .env
	sed -i \
		-e 's/enigma_core_hw/enigma_core_sw/g' \
		-e 's/enigma_km_hw/enigma_km_sw/g' \
		docker-compose.yml
endif

	yarn install
	yarn dc pull

.PHONY: compile
compile:
	yarn dc compile

.PHONY: migrate
migrate: compile
	yarn dc migrate

.PHONY: test
test: compile
	yarn dc test

.PHONY: stop
stop:
	yarn dc stop

# Run this task in a separate console
.PHONY: start
start:
	yarn dc start

.PHONY: report-environment
report-environment:
# This hack just prints a screen-wide line of '=' characters
	@seq -s= $$(tput cols) | tr -d '[:digit:]'
	@echo building with:
	@echo SGX_MODE = $(SGX_MODE)
	@seq -s= $$(tput cols) | tr -d '[:digit:]'
