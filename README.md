# orbit-server

Server for Orbit networks

Requires Aerospike, see http://www.aerospike.com/docs/operations/install/

Also requires `orbit-client` (https://github.com/haadcode/orbit-client) to be cloned in `../` atm.

***orbit-server is still WIP. Please report any problems and give your feedback in the issues!***

## Run
```
npm install
npm start
```

## Test
```
npm test
```

## Config
Change the configuration in `src/index.js`. Default options are:
```javascript
const serverConfig = {
  networkId: "anon-test",
  networkName: "Anonymous Networks TEST",
  salt: "thisisthenetworksalt",
  userDataPath: path.resolve(process.cwd(), "users/"), // ./users
  enableMetrics: false, // set to true to print some metrics
  metricsInterval: 60000 // 1 min
}
```

Make sure to generate your own keys in and place them in `keys/private.pem` and `keys/public.pem`

## Notes
- To enable metrics posting to librato, set env variables `LIBRATO_EMAIL` and `LIBRATO_TOKEN`
