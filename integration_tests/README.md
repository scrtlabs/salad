# Integration tests

These tests are meant to be run in the `docker-environment` network from the `salad_client`
container. After opening that container, run the following command:

```sh
npx mocha --exit integration_tests/
```
