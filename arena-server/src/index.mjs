import { defineRoom, defineServer } from 'colyseus';
import { ArenaRoom } from './ArenaRoom.mjs';

export function createArenaServer() {
  return defineServer({
    rooms: {
      black_hole_arena: defineRoom(ArenaRoom),
    },
    express: (app) => {
      app.get('/health', (_request, response) => {
        response.status(200).json({ service: 'black-hole-recycle-arena', status: 'ok' });
      });
    },
  });
}

const directLaunch = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (directLaunch) {
  const requestedPort = Number.parseInt(process.env.PORT || process.argv[2] || '2567', 10);
  const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 2567;
  const server = createArenaServer();
  await server.listen(port);
  console.log(`[arena-server] listening on http://127.0.0.1:${port}`);
}
