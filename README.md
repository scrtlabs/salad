# Enigma CoinJoin
A CoinJoin implementation of the Enigma Discovery Network.

## How to Build
### Dependencies
- `node == v11.15.0`
- `rustc == nightly-2019-08-01`
- `yarn == 1.17.3`
- `Docker == 18.09.8-ce, build 0dd43dd87f`
- `docker-compose == 1.24.1, build 4667896`

### Instructions
This project uses Yarn Workplaces so using yarn over npm is recommended.

- `git clone https://github.com/enigmampc/coinjoin-poc`
- `cd coinjoin-poc`
- Create `.env` from `.env.template` after review or edit
- `cd enigma-coinjoin-operator`
- Create `.env` from `.env.template` after review or edit
- `cd ..`
- Create `docker-compose.yml` from `docker-compose.cli-hw.yml` or `docker-compose.cli-sw.yml`
- `yarn install`
- `yarn dc pull`
- `yarn dc start` <- In background or separate terminal
- `yarn dc compile`
- `yarn dc migrate`
- `yarn dc test`

## Architecture
### Definitions
- Relayer: TODO: Use operator instead?
- Deposit
- Recipient Address
- Anonimity Set: TODO: Instead of liquidity pool? 
- Deal
- Plain Text
- Fee
- Frontrunning
- Selected Worker

### Overview

![](https://i.imgur.com/08lQQHN.png)

Here is the highly simplified user workflow:

1. *Send Deposit:* Guided by a user interface, the participant sends a deposit to the mixer contract. 
2. Send Signed Encrypted Recipient Address: Guided by the same UI, the participant encrypts the recipient address (who should receive the deposit after mixing), sign the message and send to the Relayer.
3. *Watch Liquidity:* The Relayer does accounting of all deposits matching the amount sent by the participant until the pre-defined participation threshold is reached. The participation threshold is the number of participants per deal required to achieve sufficient anonymity. For example, suppose that Bob deposits 1ETH and the participation threshold is 2. When Alice follows and deposit 1ETH, the participation threshold is reached and the Relayer can create a new deal. 
4. To create a deal, the Relayer gathers the following data: 1) Number of participants; 2) Deposit addresses; 3) Encrypted recipient addresses.  The Relayer uses `enigma-js` to include this payload into an Enigma transaction.
5. *Decrypt and Mix Recipients:* The secret contract decrypt recipient addresses and uses the `eng_wasm` randomness service to re-order (mix) them. 
6. *Submit Mixed Plain Text Recipient Addresses:* The secret contract calls the Ethereum smart contract with the list of mixed addresses (in clear text) and other deal attributes. The smart contract has a modifier that  only authorizes Enigma.
7. *Distribute Deposits:* The smart contract send the deposits of the deal to the specified recipients. 
   
### Notes
#### Why the Relayer?
It is theoretically possible for an end-user to interface with Ethereum and Enigma from a browser frontend. However, here are some key reasons why a Relayer is appropriate.

1. *Synchronize Enigma and Ethereum*: Enigma can write to Ethereum but, at the time of writing, it cannot read. The Relayer acts as a gate-keeper to ensure that all participants have a deposit locked in escrow on Ethereum. This avoids obvious spam attacks that would cause deals to break down on execution.
2. *Transaction Hell*: In a naive implementation, the end-user would have to make three Ethereum transactions (instead of one) to make a deposit: 1) Deposit on Ethereum; 2) Approve ENG for gas; 3) Create a Task Record. This is a much worse UX, arguably unusable for some.                 
3. *Economic Abstraction*: Since only the Relayer interfaces with Enigma, the end-user does not need to own ENG (more on that below).
4. *Cost*: As described in point 2, the number of transactions would increase exponentially. With a Relayer, there is only one Enigma transaction per deal. Without, there will be one transaction per deposit. Since deals are expected to have a relatively large quorum, the total transaction cost of a deal would be orders of magnitude higher.
5. *Scheduling*: Neither Enigma nor Ethereum have a scheduler, which is required to execute deals at specific time intervals (more on that below). In addition, the Relayer can perform other proactive operations; like monitoring account balances, which can make upfront deposits unnecessary and improve the UX further.                     
6. *Compatibility*: Other mixer projects (e.g. Semaphore) are designing a standard Relayer api, by maintaining compatibility, the Enigma CoinJoin can be part an aggregate where the end-users choose their preferred backend. This could result in significantly more liquidity.                        

#### On Competing Approaches
Mixers are fashionable at the moment, here comprehensive info about competing projects: <https://hackmd.io/rCARMvVQSCKDHFk19bVhww?view>  Basically, there is ongoing work to standardize on a ZK mixer.  Here is the Semaphore implementation: <https://hackmd.io/qlKORn5MSOes1WtsEznu_g#Withdrawals-at-midnight-UTC> At the time of writing, here are some potential benefits of our approach. These need be confirmed as the ZK implementations evolve and others might be added to the list.

1. *Lower Fee*: Computing ZK proofs on chain is expensive and mixers are no exception. Using Enigma is MAYBE cheaper (more analysis needed). 
2. *Non-Interactive*: With ZK implementation, a participants must interact with the system to deposit and withdraw: 1) Make a deposit and obtain  a note; 2) Wait for multiple other deposits to maximize anonymity; 3) Submit the note with a recipient address (withdraw). Our mixer requires a single interaction (during deposit). Withdraw happens asynchronously without user interaction. 
3. *Possibility to Split a Deposit into Multiple Deals*: Because withdraw is non-interactive, our mixer can split a single deposit into multiple deals. For example, Bob decides to mix 1ETH and gives the Mixer 24H to finish. The Mixer uses 0.2ETH in 5 deals during this period based on available liquidity. With the Semaphore implementation, users are limited to mixing 0.1ETH per day. This is because of how the ZK proof is constructed, it's not currently possible to issue multiple notes for the same address.
4. *Frontrunning*: Enigma transactions are encrypted therefore more difficult to frontrun. Frontrunning withdraw is possible with ZK mixers. 

Note that all advantages above can have a significant impact on user experience. Suppose that Bob wants to mix 100ETH, he can simply make a deposit and give a deadline. His deposit will be mixed automatically across multiple concurrent and non-concurrent deals without his interraction. When the deadline expires, the deposit is either mixed in full or Bob receives some change. All this for a one time fee. In the process, Bob's 100ETH provides significant liquidity to the anonimity set, helping fund multiple deals. If Bob were to use Semaphore instead, Bob would have to wait 1000 days or somehow split his balances into up to 1000 wallets. Also, Bob would need a secure system that can reliably keep a browser window alive while propecting his Notes (which equivalent to a blank check) exposed in plain text in the browser memory. Bob would also pay a fee for each 0.1ETH deposit. 

#### On Economic Abstraction
Other than for his deposit (which could be replace by a proxy approval), the participants does not directly pay gas nor interface with  Enigma. Gas is paid to Enigma by the Relayer. This business cost is recouped by the Relayer by taking a share of each deal during execution.

#### On Encryption
The encryption scheme isn't yet fully defined but it is implied that participants will authorize a secure enclave to decrypt their recipient address, not the Relayer. To achieve this, we can either:

1. Create a static key pair in the secret contract after deployment. The private key will never be revealed externally. The public key will be used to encrypt all addresses. 
2. Users get selected worker public key using `enigma-js` and use for encryption. The problem with this is that deals cannot include deposits from earlier epochs. 
3. Consider proxy re-encryption. 

For the initial prototype, I'm using approach #1. ZK-based mixers don't utilize encryption like this because mixing requires 2-step process. First, a participant computes a ZK proof and gets a Note. At a later time, the same participant submit the Note and a recipient address. Assuming that the proof does not leak information, the deposit address is never directly linked to the recipient address.

#### Attack Vectors
1. *Spam*: An attacker could submit large amount of deposits to create artificial liquidity and de-anonymize other participants. If there are 10 participants in a deal, and 9 of those are the attacker, the 1 left isn't anonymous to the attacker. Semaphore addresses this by executing deals on a schedule, not by a participation threshold. The best solution is probably a combination of both. More research needed. 

## Problems
- [x] Unable to use latest ring. Error during migration.
      ```
      core_1      | Error in deployment of smart contract function: Error in execution of WASM code: Instantiation: Export GFp_gcm_gmult_4bit not found
      core_1      | 15:20:18 [INFO] deploy_contract() => Ok(FailedTask { result: FailedTask { output: "435880ff72171fdbebbdc06f22c27e39957af05de3c963682e340e1f512cf69b583ba0a3eaad3b56f1afa9a5560d9d5be371b99cd12db45fa5754781e7f26f3ed4b6eef50a041be4f06b1f5f75953672c552f5ac72f51389b1ca05ecbf15a274436807cb79f0699e96e0beeaa9346d", used_gas: 0, signature: "800208408c6ee1bd8e6f233557821f99d748ba3ab600e8fb74de8d674505048d2956a582b8515e0c25ea29c0e86b30468f51e4fcf8d177d1964502c4ab883ab81b" } })
      ```
- [ ] Keeping the built Enigma contracts should not be necessary. Add to `discovery-cli`.
- [x] How to approach error handling in secret contracts?
- [ ] Intermittent: `Wrong epoch for this task` errors      
- [ ] Unable to pass `bytes32` to smart contracts
- [ ] Unable to pass `string[]` to secret contract. The current workaround is to concat/split a `Vec<u8>` argument.
- [ ] Deployment often fails 
- [x] Can't use the `vec![]` macro
- [ ] Starting the network sometimes fails, resulting in a `Division by zero` error during deployment

# Detailed Protocol
Checked list items have been implemented, others are pending.

## Deposit Payload
- Sender Address
- Amount
- Encrypted Recipient Address
- User Public Key
- Nonce

## Hashes
- DealId: `H(Sender Addresses, Amount, Relayer Ethereum Address, Relayer Ethereum Nonce)`

## Workflow
### User
- [x] Get the Public Encryption Key, and the signature of the worker who generated it, from the Relayer (previously fetched from the secret contract and stored in cache). 
- [ ] Recover the worker's address from the signature, verify its authenticity against the Worker Registry of the Enigma contract.
- [x] Generate a key pair for encryption of the Recipient Address.
- [x] Make a deposit in the CoinJoin smart contract. A record of "Sender Address => Amount" now exists on-chain.
- [x] Encrypt the Recipient Address using a key derived from the Public Encryption Key and the User Private Key. 
- [x] Sign the payload using an Ethereum wallet (e.g. MetaMask).
- [x] Submit the Deposit Payload and Signature to the Relayer. 

### Mixer
- [x] To prevent spam, the Relayer verifies the Payload Signature.
- [x] Relayer holds the Payload until a trigger (based on time and participation threshold).
- [x] Relayer creates a Deal on-chain by submitting the Amount and Sender Addresses. The DealId hash is computed on-chain. A record of a Pending Deal now exists on-chain.
- [ ] Relayer submits its Ethereum Address, Ethereum Nonce, Payloads and Signatures to the secret contract.
- [x] Secret contract verifies the signatures. We now have verified Payloads in the secret contract.
- [ ] Relayer computes the DealId, which is a hash computed partly from verified Sender Addresses, becoming a proof to be validated on-chain. It is not possible to target a DealId hash without having verified the signatures.
- [x] Secret contract decrypts each Recipient Address by deriving a key from the Encryption Private Key and each User Public Key.
- [x] Secret contract generates a random seed and mixes the address using a Fisher–Yates shuffle.
- [ ] Secret contract submits the DealId and Shuffled Plaintext Recipient Addresses on-chain.
- [x] Smart contract finds the Deal by DealId, verifies that the status is Pending and verifies the Deposit balances.
- [x] Smart contract transfers each deposit to the Recipients, subtracting them from the each Sender's balance.
- [x] The Deal status is now Executed
