import { createServer } from "node:http";
import { Rooms } from "./rooms.ts";
const game = new Rooms({ timeScale: 0.5, recordsFile: null, profilesFile: null, startItems: { apple: 2, pearl: 1, shield: 1, snowball: 4, tnt: 1 } });
const server = createServer((_req, res) => res.end("ok"));
server.on("upgrade", (req, socket, head) => {
  if (!game.handleUpgrade(req, socket, head)) socket.destroy();
});
server.listen(3001, "127.0.0.1", () => console.log("scratch on 3001"));
