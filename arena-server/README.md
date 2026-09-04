# BlackHoleRecycle Arena Server

This is an actual local Colyseus 0.18 authority slice: multiple clients join `black_hole_arena`, send sequenced normalized movement input, and receive server-owned positions.

It is intentionally not yet connected to the Cocos “竞技吞噬” route. The production route remains a clearly labelled local 1v7 match until pickup ownership, combat, revive and rewards are authoritative on this service and a public `wss://` endpoint is configured for mobile builds.

```powershell
cd arena-server
npm install
npm test
npm start
```

The local health endpoint is `http://127.0.0.1:2567/health`.
