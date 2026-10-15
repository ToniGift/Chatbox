"""
Chatbot Backend — proxies chat requests to Nebius Token Factory
-----------------------------------------------------------------
This server is the ONLY thing that ever talks to Nebius directly.
Your API key lives here, never in the browser or a mobile app.

Any frontend (web widget, mobile app, Slack bot, whatever) can use this
same backend by calling POST /chat — that's the whole point of separating
"backend" from "frontend": one backend, many possible frontends.

Setup:
    pip install flask flask-cors requests

    export NEBIUS_API_KEY="your-token-factory-key-here"

Run:
    python app.py

The server starts on http://localhost:5000
"""

import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allows the browser widget (a different "origin") to call this server

NEBIUS_API_KEY = os.environ.get("NEBIUS_API_KEY")
NEBIUS_BASE_URL = "https://api.studio.nebius.ai/v1/chat/completions"
MODEL_NAME = "meta-llama/Meta-Llama-3.1-70B-Instruct"

# This is where you define what your assistant is FOR. Customize this freely —
# it's the entire personality/scope of your bot.
SYSTEM_PROMPT = """You are a friendly, concise customer support assistant.
Answer clearly in 2-4 sentences unless the user asks for more detail.
If you don't know something specific to the business, say so honestly and
suggest the user contact a human — never make up policy details."""


@app.route("/chat", methods=["POST"])
def chat():
    """
    Expects JSON body:
    {
        "message": "the user's new message",
        "history": [
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ]
    }
    history is optional — omit it (or send []) for a fresh conversation.

    Returns JSON:
    {"reply": "the assistant's response"}
    """
    if not NEBIUS_API_KEY:
        return jsonify({"error": "Server misconfigured: NEBIUS_API_KEY not set"}), 500

    body = request.get_json(force=True, silent=True) or {}
    user_message = body.get("message", "").strip()
    history = body.get("history", [])

    if not user_message:
        return jsonify({"error": "message is required"}), 400

    # Rebuild the full conversation: system prompt + prior turns + new message.
    # The model has NO memory between API calls — this list IS its memory.
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "max_tokens": 400,
        "temperature": 0.5,
    }
    headers = {
        "Authorization": f"Bearer {NEBIUS_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(NEBIUS_BASE_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        reply = data["choices"][0]["message"]["content"].strip()
        return jsonify({"reply": reply})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Upstream API error: {str(e)}"}), 502


@app.route("/health", methods=["GET"])
def health():
    """Simple check to confirm the server is running."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
