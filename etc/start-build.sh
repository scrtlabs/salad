echo "Waiting for the Key Management node to start..."
until curl -s -m 1 localhost:3040 >/dev/null 2>&1; do sleep 2; done

echo "Network online, starting build..."
cd src || exit
#npm install
/bin/bash
