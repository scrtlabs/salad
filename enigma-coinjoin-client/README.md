* Enigma CoinJoin - Client Package

This is a simply client library that wraps the business logic to be included in a frontend.
It interfaces with the operator (through a WS client) and Ethereum (through Web3). 

It uses common-js modules for convenience when unit testing with node.


** Port to the browser

I recommend using browserify to port this library to the browser. 
This would require replacing one import (`enigma-js`) to use use its browser version.
Other alternatives are acceptable as well, but in my opinion, this is the simplest.
 

