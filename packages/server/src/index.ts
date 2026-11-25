/**
 * Game server entry point: one Colyseus server with two room types, the race ("game") and the
 * co-op mode ("coop"). Run with `npm run server` (needs Node 22).
 */
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT } from "@game/shared";
import { COOP_ROOM_NAME } from "@game/shared/coop";
import { CoopRoom } from "./CoopRoom";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT ?? SERVER_PORT);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { [ROOM_NAME]: defineRoom(GameRoom), [COOP_ROOM_NAME]: defineRoom(CoopRoom) },
});

server.listen(port).then(() => console.log(`Game server listening on port ${port}`));
