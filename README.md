## How to Build
### Dependencies
- `node == v11.15.0`
- `rustc == 1.36.0-nightly (6afcb5628 2019-05-19`
- `yarn == 1.17.3`

### Instructions
- `git clone https://github.com/enigmampc/coinjoin-poc`
- `cd coinjoin-poc`
- Create `.env` from `dotenv` after review or edit
- `mkdir build`
- `yarn install`
- `docker-compose up` <- In background or separate terminal
- `yarn dc compile`
- `yarn dc migrate`

## Problems
- [ ] Unable to use latest ring. Error during migration.
      ```
      core_1      | Error in deployment of smart contract function: Error in execution of WASM code: Instantiation: Export GFp_gcm_gmult_4bit not found
      core_1      | 15:20:18 [INFO] deploy_contract() => Ok(FailedTask { result: FailedTask { output: "435880ff72171fdbebbdc06f22c27e39957af05de3c963682e340e1f512cf69b583ba0a3eaad3b56f1afa9a5560d9d5be371b99cd12db45fa5754781e7f26f3ed4b6eef50a041be4f06b1f5f75953672c552f5ac72f51389b1ca05ecbf15a274436807cb79f0699e96e0beeaa9346d", used_gas: 0, signature: "800208408c6ee1bd8e6f233557821f99d748ba3ab600e8fb74de8d674505048d2956a582b8515e0c25ea29c0e86b30468f51e4fcf8d177d1964502c4ab883ab81b" } })
      ```
- [ ] `mkdir build` should not be necessary. Add to `discovery-cli`.
- [ ] How to approach error handling in secret contracts?
- [ ] Intermittent: `Wrong epoch for this task` errors      
- [ ] Unable to pass `bytes32` to smart contracts
- [ ] Unable to pass `string[]` to secret contract. The current workaround is to concat/split a `Vec<u8>` argument.
- [ ] Deployment often fails 
- [ ] Can't use the `vec![]` macro
- [ ] Starting the network sometimes fails, resulting in a `Division by zero` error during deployment