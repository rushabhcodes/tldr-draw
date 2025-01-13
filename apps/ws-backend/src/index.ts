import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/client";

const wss = new WebSocketServer({ port: 8080 });

interface User {
  userId: string;
  rooms: string[];
  ws: WebSocket;
}

const users: User[] = [];

function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded == "string") {
      return null;
    }

    if (!decoded || !decoded.userId) {
      return null;
    }

    return decoded.userId;
  } catch (error) {
    return null;
  }
}

wss.on("connection", (ws, req) => {
  const url = req.url;
  if (!url) {
    return;
  }

  const queryParamaters = new URLSearchParams(url.split("?")[1]);
  const token = queryParamaters.get("token") || "";
  const userId = checkUser(token);

  if (!userId) {
    ws.send("Unauthorized");
    ws.close();
    return;
  }

  users.push({
    userId,
    rooms: [],
    ws,
  });

  ws.on("message", async (message) => {
    const parsedData = JSON.parse(message.toString());

    if (parsedData.type === "join_room") {
      const user = users.find((user) => user.ws === ws);
      user?.rooms.push(parsedData.roomId);
    } else if (parsedData.type === "leave_room") {
      const user = users.find((user) => user.ws === ws);
      if (!user) {
        return;
      }
      user.rooms = user.rooms.filter((room) => room !== parsedData.roomId);
    } else if (parsedData.type === "chat") {
      const user = users.find((user) => user.ws === ws);
      if (!user) {
        return;
      }
      const message = parsedData.message;
      const roomId = parsedData.roomId;

      await prismaClient.chat.create({
        data: {
          message,
          roomId,
          userId,
        },
      });

      users.forEach((user) => {
        if (user.rooms.includes(parsedData.roomId)) {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              message,
              roomId,
            })
          );
        }
      });
    }
  });
});
