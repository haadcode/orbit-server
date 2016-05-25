# orbit-server

Server for [OrbitDB](https://github.com/haadcode/orbit-db). A simple wrapper for Redis. Requires redis server to run at `locahost:<redis port>`

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

## Deploy

*Requires [Vagrant](https://www.vagrantup.com/downloads.html) to deploy*

Open [Vagrantfile]() and set Redis' password and port and your Digital Ocean token.

Run:
```
vagrant up orbit-server
vagrant ssh orbit-server
screen -r
```

## TODO
- Metrics
