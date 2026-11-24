/**
 * Game server entry point: one Colyseus server with one room type ("game").
 * Run with `npm run server` (needs Node 22).
 */
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT } from "@game/shared";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT ?? SERVER_PORT);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { [ROOM_NAME]: defineRoom(GameRoom) },
});

server.listen(port).then(() => console.log(`Game server listening on port ${port}`));
