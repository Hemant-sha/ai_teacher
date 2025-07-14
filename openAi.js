// openaiService.js
import { OpenAI } from 'openai';
import config from './config/local.json' assert { type: "json" };
import axios from 'axios';
import db from "./models/index.js";
import { getTime } from './utils/time.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

export async function initAssistant() {
  const assistant = await openai.beta.assistants.create({
    name: "KidTutor",
    instructions: `You are a kind and helpful tutor for kids. Use simple language and explain things clearly.`,
    model: "gpt-4o",
    tools: [
      { type: "code_interpreter" },
      { type: "file_search" },
      {
        type: "function",
        function: {
          name: "get_course_fee",
          description: "Returns course fee details.",
          parameters: {
            type: "object",
            properties: {
              courseId: {
                type: "string",
                description: "ID of the course"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "show_time",
          description: "Show the current time.",
          parameters: {}
        }
      }
    ]
  });

  return assistant.id;
}

export async function startUserSession(userId) {
  const thread = await openai.beta.threads.create({
    messages: [{
      role: 'assistant',
      content: 'You are helping a student. Be clear and friendly.'
    }]
  });

  await db.UserThread.create({
    user_id: userId,
    thread_id: thread.id
  });

  return thread.id;
}

export async function handleUserQuestion({ userId, assistantId, question, threadId }) {
  const messageRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
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

  const messageData = await messageRes.json();
  if (!messageRes.ok) throw new Error(messageData.error?.message || 'Failed to send message');

  const existingUserThread = await db.UserThread.findOne({ where: { user_id: userId, thread_id: threadId } });
  if (existingUserThread && !existingUserThread.title) {
    await db.UserThread.update({ title: question }, { where: { user_id: userId, thread_id: threadId } });
  }

  const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openai_api_key}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2"
    },
    body: JSON.stringify({ assistant_id: assistantId })
  });

  const runData = await runRes.json();
  if (!runRes.ok) throw new Error(runData.error?.message || 'Failed to start assistant run');
  const runId = runData.id;

  let runStatus;
  do {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
      headers: {
        "Authorization": `Bearer ${config.openai_api_key}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });

    runStatus = await statusRes.json();
    if (!statusRes.ok) throw new Error(runStatus.error?.message || 'Run status error');

    if (runStatus.status === 'requires_action') {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;

      const toolOutputs = await Promise.all(toolCalls.map(async (tool) => {
        const args = JSON.parse(tool.function.arguments);

        switch (tool.function.name) {
          case 'get_course_fee':
            const feeRes = await fetch('http://localhost:5000/api/admin/fee-categories');
            const feeData = await feeRes.json();
            return { tool_call_id: tool.id, output: feeData.feesByCategory || 'No fee data' };

          case 'show_time':
            const timeRes = await getTime();
            return { tool_call_id: tool.id, output: timeRes };

          default:
            return { tool_call_id: tool.id, output: 'Tool not recognized.' };
        }
      }));

      const submitRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.openai_api_key}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        },
        body: JSON.stringify({ tool_outputs: toolOutputs })
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.error?.message || 'Failed to submit tools');
    }

  } while (runStatus.status !== 'completed' && runStatus.status !== 'failed');

  const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    headers: {
      "Authorization": `Bearer ${config.openai_api_key}`,
      "OpenAI-Beta": "assistants=v2"
    }
  });

  const messages = await msgRes.json();
  const last = messages.data.find(m => m.role === 'assistant');
  return last?.content?.[0]?.text?.value || 'No response';
}
