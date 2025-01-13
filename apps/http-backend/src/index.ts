import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { middleware } from "./middleware";
import {
  CreateRoomSchema,
  CreateUserSchema,
  SigninSchema,
} from "@repo/common/types";
import { prismaClient } from "@repo/db/client";
import bcrypt from "bcrypt";

const app = express();
app.use(express.json());

app.post("/signup", async (req, res) => {
  try {
    const parsedData = CreateUserSchema.safeParse(req.body);
    if (!parsedData.success) {
      console.log(parsedData.error);
      res.status(400).json({
        message: "Incorrect inputs",
      });
      return;
    }
    // check if user already exists
    const existingUser = await prismaClient.user.findFirst({
      where: {
        email: parsedData.data.email,
      },
    });
    if (existingUser) {
      res.status(400).json({
        message: "User already exists",
      });
      return;
    }
    // hash the password
    const hashedPassword = await bcrypt.hash(parsedData.data.password, 10);

    // db call to create user
    let user;
    try {
      user = await prismaClient.user.create({
        data: {
          name: parsedData.data.name,
          email: parsedData.data.email,
          password: hashedPassword,
        },
      });
    } catch (error) {
      res.status(500).json({
        message: "Error creating user: " + error,
      });
      return;
    }

    // send success response with user id
    res.json({
      userId: user.id,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/signin", async (req, res) => {
  const parsedData = SigninSchema.safeParse(req.body);
  if (!parsedData.success) {
    res.status(500).json({
      message: "Incorrect inputs",
    });
    return;
  }
  // db call to check user exists
  const user = await prismaClient.user.findFirst({
    where: {
      email: parsedData.data.email,
    },
  });

  // if user exists, check password
  if (!user) {
    res.status(404).json({
      message: "User not found",
    });
    return;
  }
  const passwordMatch = await bcrypt.compare(
    parsedData.data.password,
    user.password
  );
  if (!passwordMatch) {
    res.status(401).json({
      message: "Incorrect password",
    });
    return;
  }

  // send token
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);

  res.json({
    token,
  });
});
app.post("/signout", (req, res) => {
  res.json({
    message: "User signed out",
  });
});

app.post("/room", middleware, async (req, res) => {
  const parsedData = CreateRoomSchema.safeParse(req.body);
  console.log(parsedData.data);
  if (!parsedData.success) {
    res.status(400).json({ message: "Incorrect Input" });
    return;
  }
  // db call
  try {
    const room = await prismaClient.room.create({
      data: {
        slug: parsedData.data.slug,
        // @ts-ignore
        adminId: req.userId,
      },
    });
    res.json({
      roomId: room.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/chats/:roomId", async (req, res) => {
  console.log(req.params.roomId);
  const roomId = Number(req.params.roomId);
  console.log(roomId);
  // db call
  const messages = await prismaClient.chat.findMany({
    where: {
      roomId: roomId,
    },
    take: 50,
    orderBy: {
      id: "desc",
    },
  });
  console.log(messages);
  res.json({ messages });
});

app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001");
});
