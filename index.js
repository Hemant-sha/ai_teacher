// Required packages
import express from 'express';
import config from './config/local.json' assert { type: "json" };
import db from "./models/index.js";
import { initAssistant, startUserSession, handleUserQuestion } from './openAi.js';
import { initWebSocket } from './webSocket.js';
import { createServer } from 'http';

// App and OpenAI init
const app = express();
app.use(express.json());
app.set("view engine", "ejs");

const server = createServer(app); // Use raw HTTP server
initWebSocket(server);
// Inside your route handlers
app.post('/api/init-assistant', async (req, res) => {
  try {
    const assistantId = await initAssistant();
    res.json({ assistantId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/start-session', async (req, res) => {
  const { userId } = req.body;
  try {
    const threadId = await startUserSession(userId);
    res.json({ threadId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ask', async (req, res) => {
  const { userId, assistantId, question, threadId } = req.body;
  try {
    const reply = await handleUserQuestion({ userId, assistantId, question, threadId });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* list of message according to threads */
app.get("/api/messages/:threadId", async (req, res) => {
  const { threadId } = req.params;
  const messageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${config.openai_api_key}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2"
    },
  });
  const messageData = await messageResponse.json();
  if (!messageResponse.ok) throw new Error(messageData.error?.message || 'Failed to send message');
  return res.json(messageData).status(200);
}
);

/* list of threads */
app.get("/api/threads", async (req, res) => {
  let threads = await db.UserThread.findAll({ attributes: ['user_id', 'thread_id', 'title'] });
  return res.json(threads).status(200);
}
);

app.get(
  "/",
  (req, res) => {
    res.render("chatbot");
  }
);

// Initialize database and sync models
async function initializeApp() {
  try {
    console.log('🔄 Initializing application...');

    // Test database connection
    await db.sequelize.authenticate();
    console.log('✅ Database connection established');

    // Sync database models (safe mode - only creates missing tables)
    await db.sequelize.sync({
      alter: false,  // Don't alter existing tables
      force: false   // Don't drop existing tables
    });
    console.log('✅ Database models synchronized');

    // Start server
    const PORT = 3000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Chatbot available at http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Application initialization failed:', error.message);
    console.error('Please check your database configuration and run the sync script if needed.');
    process.exit(1);
  }
}

// Start the application
initializeApp();
