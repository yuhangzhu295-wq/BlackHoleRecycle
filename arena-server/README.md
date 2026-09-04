# BlackHoleRecycle Arena Server

This is an actual local Colyseus 0.18 authority slice: multiple clients join `black_hole_arena`, send sequenced normalized movement input, and receive server-owned positions, recyclable suction state, mass, LV1-to-LV2 progression, T2 eligibility, player defeat, dropped mass fragments, respawn, and protection.

It is intentionally not yet connected to the Cocos “竞技吞噬” route. The production route remains a clearly labelled local 1v7 match until the Cocos client uses this authority for rendering and player input, the reward ledger is finalized server-side, and a public `wss://` endpoint is configured for mobile builds.

```powershell
cd arena-server
npm install
npm test
npm start
```

The local health endpoint is `http://127.0.0.1:2567/health`.
