## How to Build
### Dependencies
- `node == v11.15.0`
- `rustc == 1.36.0-nightly (6afcb5628 2019-05-19`
- `yarn == 1.17.3`
- `Docker == 18.09.8-ce, build 0dd43dd87f`
- `docker-compose == 1.24.1, build 4667896`

### Instructions
- `git clone https://github.com/enigmampc/coinjoin-poc`
- `cd coinjoin-poc`
- Create `.env` from `dotenv` after review or edit
- `yarn install`
- `docker-compose up` <- In background or separate terminal
- `yarn dc compile`
- `yarn dc migrate`
- `yarn dc test`

## Problems
- [ ] Unable to use latest ring. Error during migration.
      ```
      core_1      | Error in deployment of smart contract function: Error in execution of WASM code: Instantiation: Export GFp_gcm_gmult_4bit not found
      core_1      | 15:20:18 [INFO] deploy_contract() => Ok(FailedTask { result: FailedTask { output: "435880ff72171fdbebbdc06f22c27e39957af05de3c963682e340e1f512cf69b583ba0a3eaad3b56f1afa9a5560d9d5be371b99cd12db45fa5754781e7f26f3ed4b6eef50a041be4f06b1f5f75953672c552f5ac72f51389b1ca05ecbf15a274436807cb79f0699e96e0beeaa9346d", used_gas: 0, signature: "800208408c6ee1bd8e6f233557821f99d748ba3ab600e8fb74de8d674505048d2956a582b8515e0c25ea29c0e86b30468f51e4fcf8d177d1964502c4ab883ab81b" } })
      ```
- [ ] Keeping the built Enigma contracts should not be necessary. Add to `discovery-cli`.
- [ ] How to approach error handling in secret contracts?
- [ ] Intermittent: `Wrong epoch for this task` errors      
- [ ] Unable to pass `bytes32` to smart contracts
- [ ] Unable to pass `string[]` to secret contract. The current workaround is to concat/split a `Vec<u8>` argument.
- [ ] Deployment often fails 
- [ ] Can't use the `vec![]` macro
- [ ] Starting the network sometimes fails, resulting in a `Division by zero` error during deployment

## Architecture
### Overview

![Mixer Architecture Overview](./docs/discovery-mixer.png?raw=true)

Here is the high-level workflow:
1. Send Deposit: Guided by a user interface, the participant sends a deposit
   to the mixer contract. 
2. Send Signed Encrypted Recipient Address: Guided by the same UI, the participant
   encrypts the recipient address (who should receive the deposit after
   mixing), sign the message and send to the Relayer.
3. Watch Liquidity: The Relayer does accounting of all deposits matching the amount sent
   by the participant until the pre-defined participation threshold is reached.
   The participation threshold is the number of participants per deal
   required to achieve sufficient anonymity. For example, suppose that Bob
   deposits 1ETH and the participation threshold is 2. When Alice follows
   and deposit 1ETH, the participation threshold is reached and the Relayer
   can create a new deal. 
4. To create a deal, the Relayer gathers the following data: 1) Number of
   participants; 2) Deposit addresses; 3) Encrypted recipient addresses. 
   The Relayer uses `enigma-js` to include this payload into an Enigma
   transaction.
5. Decrypt and Mix Recipients: The secret contract decrypt recipient
   addresses and uses the `eng_wasm` randomness service to re-order (mix)
   them. 
6. Submit Mixed Clear Recipient Addresses: The secret contract calls
   the Ethereum smart contract with the list of mixed addresses (in clear text)
   and other deal attributes. The smart contract has a modifier that 
   only authorizes Enigma.
7. Distribute Deposits: The smart contract send the deposits of the deal
   to the specified recipients. 
   
### Notes
#### On Competing Approaches
Mixers are fashionable at the moment, here comprehensive info about
competing projects: https://hackmd.io/rCARMvVQSCKDHFk19bVhww?view. 
Basically, there is ongoing work to standardize on a ZK mixer. 
At the time of writing, here are some potential benefits of our approach.
These need be confirmed as the ZK implementations evolve and others
might be added to the list.

1. Lower Fee: Computing ZK proofs on chain is expensive and mixers
are no exception. Using Enigma is MAYBE cheaper (more analysis needed). 
2. Non-Interactive: With ZK implementation, a participants must interact
with the system to deposit and withdraw: 1) Make a deposit and obtain 
a note; 2) Wait for multiple other deposits to maximize anonymity; 
3) Submit the note with a recipient address (withdraw). Our mixer
requires a single interaction (during deposit). Withdraw happens
asynchronously without user interaction.  
3. Possibility to Split a Deposit into Multiple Deals: Because
withdraw is non-interactive, our mixer can split a single deposit
into multiple deals. For example, Bob decides to mix 1ETH and gives
the Mixer 24H to finish. The Mixer uses 0.2ETH in 5 deals during
this period based on available liquidity. Doing this with ZK would require
Bob to manually submit a note each time. This might help with
liquidity. <- I'm verifying this. I'm
not sure if there's a Relayer solution that would permit this.
4. Frontrunning: Enigma transactions are encrypted therefore more
difficult to frondrun. Frontrunning withdraw is possible with ZK mixers. 

#### On Economic Abstraction
Other than for his deposit (which could be replace by a proxy
approval), the participants does not directly pay gas nor interface with 
Enigma. Gas is paid to Enigma by the Relayer. This business cost
is recouped by the Relayer by taking a share of each deal during
execution.

#### On Encryption
The encryption scheme isn't yet fully defined but it is implied
that participants will authorize a secure enclave to decrypt their
recipient address, not the Relayer. To achieve this, we can either:

1. Create a static key pair in the secret contract after deployment.
The private key will never be revealed externally. The public key will
be used to encrypt all addresses. 
2. Users get selected worker public
key using `enigma-js` and use for encryption. The problem with this
is that deals cannot include deposits from earlier epochs. 
3. Consider proxy re-encryption. 

For the initial prototype, I'm using approach #1. ZK-based mixers
don't utilize encryption like this because mixing requires 2-step process.
First, a participant computes a ZK proof and gets a Note. At a later time,
the same participant submit the node and a recipient address. Assuming
that the proof does not leak information, the deposit
address is never directly linked to the recipient address.

