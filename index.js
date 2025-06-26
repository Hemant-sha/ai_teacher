// Required packages
import express from 'express';
import { OpenAI } from 'openai';
import axios from 'axios';
import config from './config/local.json' assert { type: "json" };
import db from "./models/index.js";

// App and OpenAI init
const app = express();
app.use(express.json()); 
app.set("view engine", "ejs");
const openai = new OpenAI({ apiKey: config.openai_api_key });

// Route: Initialize assistant (run once and reuse the ID)
app.post('/api/init-assistant', async (req, res) => {
  try {
    const assistant = await openai.beta.assistants.create({
      name: "KidTutor",
      instructions: `You are a kind and helpful tutor for kids. Use simple language and explain things clearly. Be supportive and friendly. Choose the correct tool based on the user's intent.`,
      model: "gpt-4o",
      tools: [
        { type: "code_interpreter" },
       // { type: "retrieval" },
       // "error": "400 Invalid value: 'retrieval'. Supported values are: 'code_interpreter', 'function', and 'file_search'."
        {
          type: "function",
          function: {
            name: "get_question_hint",
            description: "Get a hint or explanation from the tutor's hint API.",
            parameters: {
              type: "object",
              properties: {
                questionId: { type: "string", description: "ID of the question" },
                userLevel: { type: "string", enum: ["easy", "medium", "hard"] }
              },
              required: ["questionId"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "explain_topic",
            description: "Call the topic explanation API to explain a concept.",
            parameters: {
              type: "object",
              properties: {
                topic: { type: "string", description: "Topic or concept to explain" }
              },
              required: ["topic"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "grade_answer",
            description: "Call the grading API to check a student's answer.",
            parameters: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                answer: { type: "string" }
              },
              required: ["questionId", "answer"]
            }
          }
        }
      ]
    });
    res.json({ assistantId: assistant.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route: Start session for a user (creates a thread)
app.post('/api/start-session', async (req, res) => {
  const { userId } = req.body;
  try {
    // Check if user already has a thread
    const existingUserThread = await db.UserThread.findOne({
      where: { user_id: userId }
    });
    if (existingUserThread) {
      return res.json({ threadId: existingUserThread.thread_id });
    }

    // Create new OpenAI thread
    const thread = await openai.beta.threads.create({
      messages: [
        {
          //"error": "400 Invalid value: 'system'. Supported values are: 'user' and 'assistant'."
          role: 'assistant',
          content: 'You are helping a student who may ask questions, need explanations, or seek clarifications on problems they got wrong. Be gentle, clear, and friendly.'
        }
      ]
    });

    // Save user thread to database
    await db.UserThread.create({
      user_id: userId,
      thread_id: thread.id
    });

    res.json({ threadId: thread.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// // Route: Ask a question
// app.post('/api/ask', async (req, res) => {
//   const { userId, assistantId, question, threadId } = req.body;
//   try {
//     // Find user's thread
//     const userThread = await db.UserThread.findOne({
//       where: { user_id: userId }
//     });
//     if (!userThread) {
//       return res.status(404).json({ error: 'Session not found' });
//     }
    
//    // const threadId = userThread.get('thread_id');
//     console.log("type of userThread", typeof threadId);
//     console.log("this is the thread id", threadId);
//     console.log("question", question);

//     // Add user message to thread
//     // await openai.beta.threads.messages.create({
//     //   thread_id: threadId,
//     //   role: 'user',
//     //   content: question
//     // });

//     //https://api.openai.com/v1/threads/{thread_id}/messages
//     const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
//       method: "POST",
//       headers: {
//         "Authorization": `Bearer ${config.openai_api_key}`,
//         "Content-Type": "application/json",
//         "OpenAI-Beta": "assistants=v2" // IMPORTANT
//       },
//       body: JSON.stringify({
//         role: "user",
//         content: question
//       })
//     });
    
//     const data = await response.json();
//     console.log(data);
    

//     console.log("i am here");

//     // Run assistant
//     let run = await openai.beta.threads.runs.create({
//       thread_id: threadId,
//       assistant_id: assistantId
//     });

//     // Poll until complete or requires action
//     let runStatus;
//     do {
//       await new Promise(r => setTimeout(r, 1000));
//       runStatus = await openai.beta.threads.runs.retrieve({
//         thread_id: threadId,
//         run_id: run.id
//       });

//       if (runStatus.status === 'requires_action') {
//         const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;

//         const toolOutputs = await Promise.all(toolCalls.map(async (tool) => {
//           const args = JSON.parse(tool.function.arguments);

//           switch (tool.function.name) {
//             case 'get_question_hint': {
//               const response = await axios.get(`${process.env.HINT_API_URL}?questionId=${args.questionId}&userLevel=${args.userLevel || 'medium'}`);
//               return { tool_call_id: tool.id, output: response.data.hint || 'No hint available.' };
//             }
//             case 'explain_topic': {
//               const response = await axios.get(`${process.env.TOPIC_API_URL}?topic=${encodeURIComponent(args.topic)}`);
//               return { tool_call_id: tool.id, output: response.data.explanation || 'No explanation available.' };
//             }
//             case 'grade_answer': {
//               const response = await axios.post(`${process.env.GRADE_API_URL}`, {
//                 questionId: args.questionId,
//                 answer: args.answer
//               });
//               return { tool_call_id: tool.id, output: response.data.feedback || 'No feedback available.' };
//             }
//             default:
//               return { tool_call_id: tool.id, output: 'Tool not recognized.' };
//           }
//         }));

//         await openai.beta.threads.runs.submitToolOutputs({
//           thread_id: threadId,
//           run_id: run.id,
//           tool_outputs: toolOutputs
//         });
//       }
//     } while (runStatus.status !== 'completed');

//     // Get response
//     const messages = await openai.beta.threads.messages.list({
//       thread_id: threadId
//     });

//     const last = messages.data.find(m => m.role === 'assistant');
//     res.json({ reply: last?.content[0].text.value || 'No response' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

app.post('/api/ask', async (req, res) => {
  const { userId, assistantId, question, threadId } = req.body;
  try {
    // (Optional) Validate user/thread if needed
    if (!threadId || !assistantId || !question) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // STEP 1: Add user message to thread
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openai_api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        role: "user",
        content: question
      })
    });

    const messageData = await messageResponse.json();
    if (!messageResponse.ok) throw new Error(messageData.error?.message || 'Failed to send message');

    // STEP 2: Run assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openai_api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });
    console.log("i am here 1");

    const runData = await runResponse.json();
    if (!runResponse.ok) throw new Error(runData.error?.message || 'Failed to start assistant run');

    const runId = runData.id;

    // STEP 3: Poll run status
    let runStatus;
    do {
      await new Promise(r => setTimeout(r, 1000));

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          "Authorization": `Bearer ${config.openai_api_key}`,
          "OpenAI-Beta": "assistants=v2"
        }
      });

      runStatus = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(runStatus.error?.message || 'Error checking run status');
      console.log("runStatus", runStatus);
      // STEP 4: Handle tool calls if needed
      // if (runStatus.status === 'requires_action') {
      //   const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;

        // const toolOutputs = await Promise.all(toolCalls.map(async (tool) => {
        //   const args = JSON.parse(tool.function.arguments);
        //   switch (tool.function.name) {
        //     case 'get_question_hint':
        //       const hintResp = await fetch(`${process.env.HINT_API_URL}?questionId=${args.questionId}&userLevel=${args.userLevel || 'medium'}`);
        //       const hintData = await hintResp.json();
        //       return { tool_call_id: tool.id, output: hintData.hint || 'No hint available.' };

        //     case 'explain_topic':
        //       const explainResp = await fetch(`${process.env.TOPIC_API_URL}?topic=${encodeURIComponent(args.topic)}`);
        //       const explainData = await explainResp.json();
        //       return { tool_call_id: tool.id, output: explainData.explanation || 'No explanation available.' };

        //     case 'grade_answer':
        //       const gradeResp = await fetch(`${process.env.GRADE_API_URL}`, {
        //         method: 'POST',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify({
        //           questionId: args.questionId,
        //           answer: args.answer
        //         })
        //       });
        //       const gradeData = await gradeResp.json();
        //       return { tool_call_id: tool.id, output: gradeData.feedback || 'No feedback available.' };

        //     default:
        //       return { tool_call_id: tool.id, output: 'Tool not recognized.' };
        //   }
        // }));

        // Submit tool outputs
      //   const submitResp = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
      //     method: "POST",
      //     headers: {
      //       "Authorization": `Bearer ${config.openai_api_key}`,
      //       "Content-Type": "application/json",
      //       "OpenAI-Beta": "assistants=v2"
      //     },
      //     body: JSON.stringify({ tool_outputs: toolOutputs })
      //   });

      //   const submitData = await submitResp.json();
      //   if (!submitResp.ok) throw new Error(submitData.error?.message || 'Failed to submit tool outputs');
      // }

    } while (runStatus.status !== 'completed' && runStatus.status !== 'failed');
    console.log("i am here 2");
    // STEP 5: Get assistant reply
    const msgResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        "Authorization": `Bearer ${config.openai_api_key}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });

    const messages = await msgResponse.json();
    if (!msgResponse.ok) throw new Error(messages.error?.message || 'Failed to fetch messages');

    const last = messages.data.find(m => m.role === 'assistant');
    const reply = last?.content?.[0]?.text?.value || 'No response';

    res.json({ reply });

  } catch (err) {
    console.error('Error in /api/ask:', err);
    res.status(500).json({ error: err.message });
  }
});


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
    app.listen(PORT, () => {
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
