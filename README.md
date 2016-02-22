# orbit-server

Server for Orbit networks. A simple wrapper for Redis pubsub. Requires redis server to run at `locahost:<redis port>`

## Run
```
npm install
export REDIS_PASSWORD=<redis auth password>
export REDIS_PORT=<redis port>
npm start
```

## Test
```
npm test
```
