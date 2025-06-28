// index.js — WebSocket ElevenLabs стриминг + GPT и Lead

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import http from "http";
import { createServer } from "https";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ELEVEN_KEY = process.env.ELEVEN_KEY;
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MODEL_ID = "eleven_monolingual_v1";

const OPENAI_KEY = process.env.OPENAI_KEY;
const SYSTEM_PROMPT = "Ты — Анна, консультант по банкротству. Отвечай тепло, коротко, по-человечески.";

// === GPT endpoint ===
app.post("/gpt", async (req, res) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const userId = req.body.userId || "неизвестно";
    const chatMessages = [ { role: "system", content: SYSTEM_PROMPT }, ...messages.slice(-10) ];

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-4", messages: chatMessages, temperature: 0.7 })
    });

    const data = await openaiRes.json();
    res.json(data.choices[0].message);
  } catch (e) {
    console.error("GPT error:", e);
    res.status(500).json({ error: "GPT error" });
  }
});

// === WebSocket ElevenLabs proxy ===
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/stream" });

wss.on("connection", async (client) => {
  let sessionWs = null;

  client.on("message", async (msg) => {
    const text = msg.toString();
    if (!text || !ELEVEN_KEY) return;

    const elevenWs = new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input`, {
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json"
      }
    });

    elevenWs.on("open", () => {
      sessionWs = elevenWs;
      elevenWs.send(JSON.stringify({
        text,
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        model_id: MODEL_ID
      }));
    });

    elevenWs.on("message", (chunk) => {
      client.send(chunk);
    });

    elevenWs.on("close", () => client.close());
    elevenWs.on("error", () => client.close());
  });

  client.on("close", () => sessionWs?.close());
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log("🚀 GPT+ElevenLabs WS proxy на порту", PORT);
});
