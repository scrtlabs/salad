import Web3 from 'web3';

const initWeb3 = () =>
  new Promise((resolve) => {
    // Wait for loading completion to avoid race conditions with web3 injection timing.
    window.addEventListener('load', async () => {
      // Modern dapp browsers...
      if (window.ethereum) {
          const web3 = new Web3(window.ethereum);
          const enable = async () => {
            try {
              await window.ethereum.enable();
            } catch (e) {
              await enable();
            }
          };
          await enable();
          resolve(web3);
      }
      // Legacy dapp browsers...
      else if (window.web3) {
        // Use Mist/MetaMask's provider.
        const web3 = window.web3;
        console.log('Injected web3 detected.');
        resolve(web3);
      }
      // Fallback to localhost; use dev console port by default...
      else {
        const provider = new Web3.providers.HttpProvider(
          'http://127.0.0.1:9545'
        );
        const web3 = new Web3(provider);
        console.log('No web3 instance injected, using Local web3.');
        resolve(web3);
      }
    });
  });

const getWeb3 = async () => {
  const web3 = await initWeb3();
  web3.networkId = await web3.eth.net.getId();
  return web3;
};

export default getWeb3;
