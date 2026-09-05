# BlackHoleRecycle Arena Server

This is an actual local Colyseus 0.18 authority slice: multiple clients join `black_hole_arena`, send sequenced normalized movement input, and receive server-owned positions, recyclable suction state, mass, LV1-to-LV2 progression, T2 eligibility, player defeat, dropped mass fragments, respawn, protection, match finish reason, and a per-player reward ledger.

The Cocos client has an explicit `?arenaProbe=<endpoint>` route that renders these replicated snapshots and forwards the real joystick; the default “竞技吞噬” entry remains the clearly labelled local 1v7 match. The server ledger is authoritative and visible in the probe, while account-level anti-replay persistence, a public `wss://` endpoint, production matchmaking entry, and mobile device evidence are still release gates.

```powershell
cd arena-server
npm install
npm test
npm start
```

The local health endpoint is `http://127.0.0.1:2567/health`.
