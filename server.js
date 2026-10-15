/**
 * NovaTech Support Chatbot — Backend API Server
 * Express + Google Gemini 2.5 Flash + In-Memory Session Cache
 * Falls back to keyword-based demo mode if no API key is configured.
 */

'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ─── Gemini SDK ───────────────────────────────────────────────────────────────
let GoogleGenAI;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch {
  console.warn('[WARN] @google/genai not installed. Running in demo mode only.');
}

// ─── Configuration ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim());
const MAX_TURNS = 10;          // Maximum conversation turns stored per session
const MAX_MSG_LENGTH = 500;    // Maximum user input character length
const RATE_LIMIT_MAX = 20;     // Max requests per session per minute
const RATE_LIMIT_WINDOW = 60 * 1000;

const IS_LIVE_MODE = !!(GEMINI_API_KEY && GoogleGenAI);

// ─── Load Knowledge Base ───────────────────────────────────────────────────────
const KB_PATH = path.join(__dirname, 'knowledgeBase.json');
let knowledgeBase = {};
try {
  knowledgeBase = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  console.log(`[INFO] Knowledge base loaded: ${knowledgeBase.companyName}`);
} catch (err) {
  console.error('[ERROR] Failed to load knowledgeBase.json:', err.message);
  process.exit(1);
}

// ─── In-Memory Session Store ───────────────────────────────────────────────────
// Map<sessionId, { history: Message[], lastActivity: number, rateLimiter: { count, windowStart } }>
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      history: [],
      lastActivity: Date.now(),
      rateLimiter: { count: 0, windowStart: Date.now() },
    });
  }
  const session = sessions.get(sessionId);
  session.lastActivity = Date.now();
  return session;
}

function pruneSession(session) {
  // Keep max MAX_TURNS turns (each turn = user + model = 2 messages)
  const maxMessages = MAX_TURNS * 2;
  if (session.history.length > maxMessages) {
    session.history = session.history.slice(session.history.length - maxMessages);
  }
}

// Garbage-collect sessions idle for more than 2 hours
setInterval(() => {
  const now = Date.now();
  const TTL = 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > TTL) {
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000);

// ─── Rate Limiter ──────────────────────────────────────────────────────────────
function checkRateLimit(session) {
  const now = Date.now();
  if (now - session.rateLimiter.windowStart > RATE_LIMIT_WINDOW) {
    session.rateLimiter = { count: 0, windowStart: now };
  }
  session.rateLimiter.count++;
  return session.rateLimiter.count <= RATE_LIMIT_MAX;
}

// ─── Gemini Client ─────────────────────────────────────────────────────────────
let genAI = null;
if (IS_LIVE_MODE) {
  genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log('[INFO] Gemini 2.5 Flash — LIVE MODE active');
} else {
  console.log('[INFO] No API key found — DEMO MODE active (keyword fallback)');
}

// ─── System Prompt Builder ─────────────────────────────────────────────────────
function buildSystemPrompt() {
  const kb = knowledgeBase;
  return `You are Nova, a friendly, empathetic, and professional AI Customer Support Specialist for ${kb.companyName} (${kb.tagline || ''}).

## CORE RULES — FOLLOW STRICTLY:
1. **GROUNDING ONLY**: Every answer must be based solely on the information below. NEVER invent policies, prices, promo codes, order statuses, or any facts not provided.
2. **CONCISENESS**: Keep answers to 2-4 sentences or clean bullet lists. Mobile-first formatting.
3. **ORDER DETECTION**: If the user mentions an order number like #12345, acknowledge it and simulate a realistic tracking status.
4. **ESCALATION**: If the user expresses anger, frustration, or explicitly asks for a human agent, always provide: Email: ${kb.supportEmail}, Phone: ${kb.supportPhone}, Hours: ${kb.businessHours}.
5. **SCOPE**: If asked about anything unrelated to ${kb.companyName} orders, products, shipping, returns, or support, politely say: "I can only assist with ${kb.companyName} store inquiries. For this question, I'd recommend searching online."

## COMPANY KNOWLEDGE BASE:
${JSON.stringify(kb, null, 2)}

## RESPONSE STYLE:
- Start with empathy for complaints ("I'm sorry to hear that!" / "Great question!")
- Use **bold** for key terms (policy names, dates, amounts)
- Use bullet points for multi-step instructions
- End with "Is there anything else I can help you with?" when appropriate
- Never say "As an AI" — you are Nova, a support specialist`;
}

// ─── Order Number Detection ────────────────────────────────────────────────────
function detectOrderNumber(text) {
  const match = text.match(/#?\b(\d{4,8})\b/);
  return match ? match[1] : null;
}

function simulateOrderStatus(orderId) {
  const statuses = knowledgeBase.orderStatusSimulation?.statuses || ['Processing', 'Shipped', 'Delivered'];
  // Deterministically pick a status based on the order ID digits
  const idx = parseInt(orderId.slice(-2), 10) % statuses.length;
  const status = statuses[idx];
  const eta = status === 'Delivered' ? 'delivered' : 'estimated arrival in 1-3 business days';
  return `Order **#${orderId}** is currently **${status}**. ${eta.charAt(0).toUpperCase() + eta.slice(1)}. You should have received a shipping confirmation email — check your spam folder if you don't see it. Is there anything else I can help you with?`;
}

// ─── Escalation Detection ─────────────────────────────────────────────────────
function detectEscalation(text) {
  const triggers = knowledgeBase.escalationTriggers || [];
  const lower = text.toLowerCase();
  return triggers.some(t => lower.includes(t.toLowerCase()));
}

function buildEscalationResponse() {
  const kb = knowledgeBase;
  return `I completely understand, and I sincerely apologize for the frustration. Let me connect you with our human support team right away:\n\n📧 **Email:** ${kb.supportEmail}\n📞 **Phone:** ${kb.supportPhone}\n🕐 **Hours:** ${kb.businessHours}\n\nA team member will be happy to personally assist you. Is there anything else I can clarify in the meantime?`;
}

// ─── Demo Mode Fallback (Keyword Matcher) ─────────────────────────────────────
function demoRespond(userMessage, history) {
  const msg = userMessage.toLowerCase();

  // Order lookup
  const orderId = detectOrderNumber(userMessage);
  if (orderId) return simulateOrderStatus(orderId);

  // Escalation — check KB triggers + common natural phrasings
  const extraEscalation = [
    'human', 'agent', 'person', 'speak with', 'talk to', 'real support',
    'call me', 'phone me', 'representative', 'staff',
  ];
  const isEscalation = detectEscalation(userMessage) ||
    extraEscalation.some(t => msg.includes(t));
  if (isEscalation) return buildEscalationResponse();

  // Keyword patterns → FAQ answers
  const patterns = [
    { keys: ['track', 'where is', 'order status', 'my order'], faq: 0 },
    { keys: ['payment', 'pay', 'credit card', 'paypal', 'apple pay'], faq: 1 },
    { keys: ['shipping', 'ship', 'delivery', 'how long'], faq: 2 },
    { keys: ['return', 'refund', 'send back', 'exchange'], faq: 3 },
    { keys: ['cancel', 'change my order', 'modify'], faq: 4 },
    { keys: ['damaged', 'broken', 'defective', 'wrong item'], faq: 5 },
    { keys: ['international', 'overseas', 'outside us'], faq: 6 },
    { keys: ['refund time', 'when will i get', 'money back'], faq: 7 },
    { keys: ['warranty', 'guarantee'], faq: 8 },
    { keys: ['discount', 'promo', 'coupon', 'code'], faq: 9 },
  ];

  for (const p of patterns) {
    if (p.keys.some(k => msg.includes(k))) {
      const faq = knowledgeBase.faqs?.[p.faq];
      if (faq) return faq.answer;
    }
  }

  // Greetings
  if (/^(hi|hello|hey|good morning|good afternoon|howdy|sup)\b/i.test(msg)) {
    return `Hello! 👋 I'm **Nova**, your ${knowledgeBase.companyName} support assistant. I'm here to help with orders, shipping, returns, and more. What can I assist you with today?`;
  }

  // Thanks
  if (/thank|thanks|appreciate|great|perfect/i.test(msg)) {
    return `You're welcome! 😊 I'm always here if you need anything else. Have a wonderful day!`;
  }

  // Default
  return `I'm here to help with ${knowledgeBase.companyName} orders, shipping, returns, and product questions. Could you share more details about what you need? I'll do my best to assist!`;
}

// ─── Gemini Live Mode Response ─────────────────────────────────────────────────
async function geminiRespond(userMessage, session) {
  // Quick-exit: order number or escalation (no API call needed)
  const orderId = detectOrderNumber(userMessage);
  if (orderId) return simulateOrderStatus(orderId);
  if (detectEscalation(userMessage)) return buildEscalationResponse();

  // Build the conversation for the Gemini API
  // Gemini expects: [{ role: 'user', parts: [{text}] }, { role: 'model', parts: [{text}] }, ...]
  const conversationHistory = session.history.map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  try {
    const chat = genAI.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        temperature: 0.4,
        maxOutputTokens: 512,
        systemInstruction: buildSystemPrompt(),
      },
      history: conversationHistory,
    });

    const response = await chat.sendMessage({ message: userMessage });
    return response.text?.trim() || "I'm sorry, I didn't get a response. Please try again.";
  } catch (err) {
    console.error('[Gemini Error]', err.message);
    // Graceful fallback to demo mode on API error
    return demoRespond(userMessage, session.history);
  }
}

// ─── Express App Setup ─────────────────────────────────────────────────────────
const app = express();

// CORS
const corsOptions = {
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Route: GET / ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Route: GET /api/info ──────────────────────────────────────────────────────
app.get('/api/info', (req, res) => {
  res.json({
    companyName: knowledgeBase.companyName,
    tagline: knowledgeBase.tagline,
    supportEmail: knowledgeBase.supportEmail,
    supportPhone: knowledgeBase.supportPhone,
    businessHours: knowledgeBase.businessHours,
    faqs: knowledgeBase.faqs,
    mode: IS_LIVE_MODE ? 'live' : 'demo',
  });
});

// ─── Route: POST /api/chat ─────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  // Validation
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
    return res.status(400).json({ error: 'Invalid or missing sessionId.' });
  }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required.' });
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (trimmed.length > MAX_MSG_LENGTH) {
    return res.status(400).json({ error: `Message too long. Maximum ${MAX_MSG_LENGTH} characters.` });
  }

  const session = getSession(sessionId);

  // Rate limit check
  if (!checkRateLimit(session)) {
    return res.status(429).json({ error: 'Too many messages. Please wait a moment before trying again.' });
  }

  let reply;
  if (IS_LIVE_MODE) {
    reply = await geminiRespond(trimmed, session);
  } else {
    reply = demoRespond(trimmed, session.history);
  }

  // Append to history
  session.history.push({ role: 'user', content: trimmed });
  session.history.push({ role: 'model', content: reply });
  pruneSession(session);

  return res.json({
    reply,
    mode: IS_LIVE_MODE ? 'live' : 'demo',
    turns: Math.floor(session.history.length / 2),
  });
});

// ─── Route: POST /api/reset ────────────────────────────────────────────────────
app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Invalid sessionId.' });
  }
  if (sessions.has(sessionId)) {
    sessions.get(sessionId).history = [];
  }
  return res.json({ ok: true, message: 'Conversation reset.' });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   NovaTech AI Support Chatbot — Server Started  ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  URL  : http://localhost:${PORT}                    ║`);
  console.log(`║  Mode : ${IS_LIVE_MODE ? 'LIVE (Gemini 2.5 Flash)       ' : 'DEMO (Keyword Fallback)         '}   ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});
