# 🤖 NovaTech AI Support Chatbot

> **An embeddable, AI-powered customer support chat widget** — drop it into any website with a single `<script>` tag. Backed by a Node.js/Express server and Google Gemini 2.5 Flash. Works in **Live AI mode** (with an API key) or **Demo mode** (smart keyword fallback, zero cost).

---

## 📋 Table of Contents

1. [What This Is](#1-what-this-is)
2. [How It Works](#2-how-it-works)
3. [Features](#3-features)
4. [Project Structure](#4-project-structure)
5. [Quick Start (Local)](#5-quick-start-local)
6. [Configuration](#6-configuration)
7. [Customising the Knowledge Base](#7-customising-the-knowledge-base)
8. [Embedding in a Company Website](#8-embedding-in-a-company-website)
9. [API Reference](#9-api-reference)
10. [Deploying to Production](#10-deploying-to-production)
11. [Security Notes](#11-security-notes)
12. [Extending the Project](#12-extending-the-project)

---

## 1. What This Is

This project is a **production-ready, embeddable AI customer support chatbot** built with:

| Layer | Technology |
|---|---|
| **AI Model** | Google Gemini 2.5 Flash |
| **Backend** | Node.js + Express |
| **Frontend Widget** | Vanilla JS (no framework, no build step) |
| **Styling** | Pure CSS, injected automatically |
| **Session Management** | In-memory session store with auto-cleanup |

The chatbot appears as a **floating bubble** (💬) in the bottom-right corner of any webpage. When clicked, it opens a polished chat window. It greets the user, answers questions from a **customisable knowledge base**, detects order numbers, escalates to human agents when needed, and falls back to a keyword-matching demo if no Gemini API key is provided.

**The core principle:** the browser **never** talks directly to any AI API. It talks to *your* backend, which holds the API key securely. This is the same architecture used by every real AI product.

---

## 2. How It Works

```
User's Browser (chat widget)
        │
        │  POST /api/chat  { sessionId, message }
        ▼
  Your Express Server (server.js)
        │  ├── Validates input & enforces rate limits
        │  ├── Looks up or creates a session
        │  ├── Checks for order numbers → simulates tracking
        │  ├── Checks for escalation triggers → routes to human support
        │  └── Calls Google Gemini API with full conversation history
        ▼
  Google Gemini 2.5 Flash
        │  Returns a grounded, context-aware reply
        ▼
  Your Express Server
        │  Appends reply to session history, returns { reply, mode, turns }
        ▼
  User's Browser
        └── Renders reply in the chat bubble with markdown formatting
```

### Why a backend proxy?

If you called the Gemini API directly from the browser, your API key would be **visible to anyone** who opens DevTools. Running it through your own server keeps the key secret, lets you add rate limiting, logging, and business logic — and allows the exact same endpoint to serve mobile apps, browser extensions, or any other client.

### Dual Mode

| Mode | When | Behaviour |
|---|---|---|
| **Live AI** | `GEMINI_API_KEY` is set | Full Gemini 2.5 Flash responses, context-aware |
| **Demo** | No API key | Keyword-based fallback, covers common FAQs |

---

## 3. Features

- 💬 **Floating chat widget** — self-contained, zero dependencies in the browser
- 🤖 **Google Gemini 2.5 Flash** — fast, intelligent, low-cost AI responses
- 📋 **Knowledge base driven** — customise the bot's personality, FAQs, policies in one JSON file
- 📦 **Order number detection** — recognise `#12345` and simulate realistic tracking status
- 🚨 **Escalation detection** — automatically route angry or frustrated users to human support
- ⚡ **Quick-action chips** — one-tap shortcuts for the most common questions
- 💾 **Session memory** — the bot remembers the conversation across messages (up to 10 turns)
- 🔄 **Auto session cleanup** — idle sessions garbage-collected after 2 hours
- 🛡️ **Rate limiting** — 20 messages per session per minute to prevent abuse
- 📝 **Markdown rendering** — bot replies support **bold**, *italic*, bullet lists, and emoji
- 🔢 **Character counter** — input limited to 500 characters with a live counter
- 🌐 **CORS configurable** — restrict which domains can call your backend
- 🔕 **Unread badge** — shows unread count when the widget is minimised
- ♿ **Accessible** — full ARIA roles, keyboard navigation, focus management

---

## 4. Project Structure

```
CHATBOX/
├── server.js              ← Express API server (backend)
├── knowledgeBase.json     ← Company info, FAQs, policies (edit this!)
├── package.json
├── .env.example           ← Template for environment variables
├── .env                   ← Your secrets (DO NOT commit this)
├── public/
│   ├── index.html         ← Demo/standalone page
│   ├── app.js             ← Chat widget class (embeddable)
│   └── style.css          ← Widget styles
└── README.md
```

---

## 5. Quick Start (Local)

### Prerequisites

- [Node.js](https://nodejs.org/) **v18 or higher**
- A [Google AI Studio](https://aistudio.google.com/) account (free) to get a Gemini API key

### Step 1 — Clone & install

```bash
git clone https://github.com/ToniGift/Chatbox.git
cd Chatbox
npm install
```

### Step 2 — Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
ALLOWED_ORIGINS=*
```

> Get a free Gemini API key at https://aistudio.google.com/app/apikey

### Step 3 — Start the server

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

You should see:

```
╔══════════════════════════════════════════════════╗
║   NovaTech AI Support Chatbot — Server Started  ║
╠══════════════════════════════════════════════════╣
║  URL  : http://localhost:3000                    ║
║  Mode : LIVE (Gemini 2.5 Flash)                 ║
╚══════════════════════════════════════════════════╝
```

### Step 4 — Open the chat

Visit http://localhost:3000 and click the 💬 bubble in the bottom-right corner.

---

## 6. Configuration

All configuration is done through environment variables (`.env` file):

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(empty)* | Your Google Gemini API key. If missing, runs in Demo mode |
| `PORT` | `3000` | Port the server listens on |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of allowed origins, e.g. `https://myshop.com,https://app.myshop.com`. Use `*` to allow all (not recommended for production) |

---

## 7. Customising the Knowledge Base

The file `knowledgeBase.json` is the **brain of the bot**. Edit it to match your company without touching any code.

### Key fields

```jsonc
{
  "companyName": "YourCompany",         // Bot introduces itself using this
  "tagline": "Your tagline here",
  "supportEmail": "help@yourcompany.com",
  "supportPhone": "+1 (800) 000-0000",
  "businessHours": "Mon–Fri, 9 AM – 6 PM EST",

  "faqs": [                             // Array of FAQ pairs
    {
      "question": "How do I track my order?",
      "answer": "Visit our tracking page at yourcompany.com/track ..."
    }
    // ... add as many as needed
  ],

  "escalationTriggers": [              // Words/phrases that trigger human handoff
    "refund", "lawsuit", "terrible", "worst", "scam"
  ],

  "orderStatusSimulation": {
    "statuses": ["Processing", "Shipped", "Out for Delivery", "Delivered"]
  }
}
```

> **Tip:** The Gemini system prompt is built entirely from this file. The bot will only answer questions grounded in the data you provide — it won't invent policies or prices.

---

## 8. Embedding in a Company Website

This is where the project shines. The chat widget is designed to be embedded in **any existing website** in under 5 minutes.

### Option A — The simplest embed (same-origin)

If your company website is served from the **same server** as this backend (e.g. a corporate site hosted alongside the Node app), just add two lines before `</body>`:

```html
<!-- 1. Widget styles -->
<link rel="stylesheet" href="https://your-chatbot-server.com/style.css" />

<!-- 2. Widget script — auto-initialises on load -->
<script src="https://your-chatbot-server.com/app.js"></script>
```

That's it. The widget mounts itself to `document.body` and the 💬 bubble appears.

---

### Option B — Cross-origin embed (separate domains)

If the company's website is on a **different domain** to the chatbot server (the most common real-world scenario):

**Step 1:** Set `ALLOWED_ORIGINS` on the server to allow the company's domain:

```env
ALLOWED_ORIGINS=https://www.mycompany.com,https://app.mycompany.com
```

**Step 2:** Update `API_BASE` in `public/app.js` to point to your deployed server:

```js
// Line 9 in app.js
const API_BASE = 'https://your-chatbot-server.com';
```

**Step 3:** Add these two lines to the company's HTML:

```html
<link rel="stylesheet" href="https://your-chatbot-server.com/style.css" />
<script src="https://your-chatbot-server.com/app.js"></script>
```

---

### Option C — Mount in a specific container

By default the widget attaches to `<body>`. If a company wants it inside a specific element (e.g. inside a `#support-section` div), add a container:

```html
<!-- In the company's HTML -->
<div id="chat-widget-root"></div>

<link rel="stylesheet" href="https://your-chatbot-server.com/style.css" />
<script src="https://your-chatbot-server.com/app.js"></script>
```

The widget detects `#chat-widget-root` automatically and mounts inside it.

---

### Option D — White-label / rebrand for a specific client

To deploy a version branded for a specific company (e.g. "Acme Corp"):

1. Edit `knowledgeBase.json` with Acme Corp's name, FAQs, policies, contacts
2. Deploy a separate instance of the server (each client gets their own instance)
3. Each instance has its own `GEMINI_API_KEY` and `knowledgeBase.json`
4. Embed the client-specific `app.js` URL into their website

This way, one codebase supports **unlimited clients**, each with their own branding and knowledge.

---

### Controlling the widget from your own JavaScript

The widget exposes a global `window.chatWidget` object once loaded:

```js
// Open the chat programmatically
window.chatWidget.open();

// Close the chat
window.chatWidget.close();

// Send a message as the user
window.chatWidget.sendMessage('I need help with my order');

// Reset / clear the conversation
window.chatWidget.reset();
```

This lets you trigger the chat from your own buttons or events:

```html
<button onclick="window.chatWidget.open()">💬 Chat with us</button>
```

---

## 9. API Reference

The backend exposes three REST endpoints.

### `GET /api/info`

Returns public company info and current operating mode. Called automatically by the widget on load.

**Response:**
```json
{
  "companyName": "NovaTech",
  "tagline": "...",
  "supportEmail": "support@novatech.com",
  "supportPhone": "+1 (800) 000-0000",
  "businessHours": "Mon–Fri, 9 AM – 6 PM EST",
  "faqs": [],
  "mode": "live"
}
```

---

### `POST /api/chat`

Send a user message and receive a bot reply.

**Request body:**
```json
{
  "sessionId": "sess_abc123",
  "message": "Where is my order #45678?"
}
```

**Response:**
```json
{
  "reply": "Order **#45678** is currently **Shipped**. Estimated arrival in 1-3 business days...",
  "mode": "live",
  "turns": 3
}
```

**Error responses:**

| Status | Meaning |
|---|---|
| `400` | Missing or invalid `sessionId` / `message` |
| `429` | Rate limit exceeded (20 messages/minute per session) |
| `500` | Internal server error |

---

### `POST /api/reset`

Clears the conversation history for a session.

**Request body:**
```json
{ "sessionId": "sess_abc123" }
```

**Response:**
```json
{ "ok": true, "message": "Conversation reset." }
```

---

## 10. Deploying to Production

The server is a standard Node.js/Express app — it runs anywhere Node runs.

### Recommended platforms (free tiers available)

| Platform | Notes |
|---|---|
| **Railway** | Connect GitHub repo, set env vars. Easiest, auto-deploys on push |
| **Render** | Connect GitHub repo, set env vars. Free tier sleeps after 15 min inactivity |
| **Fly.io** | `fly launch`. More control, stays awake on free tier |
| **Heroku** | `git push heroku main`. Paid only now, but very reliable |
| **AWS / GCP / Azure** | Deploy as a container or serverless function. Scales to millions |

### Environment variables to set on your platform

```
GEMINI_API_KEY=your_key_here
PORT=3000
ALLOWED_ORIGINS=https://www.yourcompany.com
```

### Production checklist

- [ ] `ALLOWED_ORIGINS` is set to specific domains (not `*`)
- [ ] `.env` file is **not** committed to git (add it to `.gitignore`)
- [ ] HTTPS is enabled (all platforms above provide this automatically)
- [ ] `NODE_ENV=production` is set

---

## 11. Security Notes

**Never commit your `.env` file or expose your `GEMINI_API_KEY` in client-side code.**

| Risk | Mitigation |
|---|---|
| **API key exposure** | Key lives only in `.env` on the server. The browser never sees it. |
| **Spam / abuse** | Rate limiter: 20 messages per session per minute |
| **Message injection** | All user input is HTML-escaped before rendering |
| **Oversized requests** | Message capped at 500 characters; JSON body limited to 16 KB |
| **Session flooding** | Sessions auto-expire after 2 hours of inactivity |
| **Cross-origin abuse** | `ALLOWED_ORIGINS` env var controls which domains can call the API |

---

## 12. Extending the Project

| Feature | Effort | Description |
|---|---|---|
| **Streaming responses** | Medium | Use Gemini's streaming API so text appears word-by-word, like ChatGPT |
| **Persistent sessions** | Medium | Store conversation history in Redis or a database (so page refresh doesn't lose context) |
| **Authentication** | Medium | Require a JWT or API token so only logged-in users can call `/api/chat` |
| **RAG (custom docs)** | High | Feed your company's documentation into the knowledge base for more accurate answers |
| **Analytics** | Medium | Log every conversation turn to a database; build a dashboard to see common questions |
| **Webhook on escalation** | Low | When a user asks for a human, post to Slack/email so your team is notified instantly |
| **Multilingual support** | Low | Add a language instruction to the system prompt; Gemini handles translation natively |
| **Mobile app backend** | Zero | The API already works for React Native / Flutter / Swift — just point `POST /api/chat` at your deployed URL |

---

## License

MIT — free to use, modify, and deploy commercially.

---

*Built with Node.js, Express, and Google Gemini 2.5 Flash.*
