/**
 * NovaTech Support Chatbot — Widget Script
 * Self-contained · No dependencies · Embeddable via <script> tag
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const API_BASE = '';   // Empty = same origin. Set to 'http://your-server:3000' for external embed.
  const MAX_CHARS = 500;
  const CHIPS = [
    { label: '📦 Track Order',    text: 'How do I track my order?' },
    { label: '🔄 Return Policy',  text: 'What is your return policy?' },
    { label: '🚚 Shipping Info',  text: 'What are the shipping options?' },
    { label: '👤 Human Agent',    text: 'I want to speak with a human agent' },
  ];

  // ── Session ID (persistent) ───────────────────────────────────────────────
  function getSessionId() {
    let id = localStorage.getItem('nt_session_id');
    if (!id) {
      id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('nt_session_id', id);
    }
    return id;
  }

  // ── Markdown Parser ───────────────────────────────────────────────────────
  function parseMarkdown(text) {
    if (!text) return '';
    let html = text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic *text*
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code `code`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bullet lists: lines starting with - or •
      .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
      // Numbered lists: 1. 2. 3.
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      // Emoji-bullets (📧 📞 etc at start of line)
      .replace(/^([\u{1F300}-\u{1FFFF}])\s+(.+)$/gmu, '<li>$1 $2</li>')
      // Wrap consecutive <li> in <ul>
      .replace(/(<li>.*?<\/li>(\n|$))+/gs, match => `<ul>${match}</ul>`)
      // Paragraph breaks
      .replace(/\n{2,}/g, '</p><p>')
      // Single line breaks inside paragraphs
      .replace(/\n/g, '<br />');

    // Wrap in paragraph if not already
    if (!html.startsWith('<')) html = `<p>${html}</p>`;
    return html;
  }

  // ── Time Helper ───────────────────────────────────────────────────────────
  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ChatWidget Class
  // ════════════════════════════════════════════════════════════════════════════
  class ChatWidget {
    constructor() {
      this.sessionId = getSessionId();
      this.isOpen = false;
      this.isLoading = false;
      this.unreadCount = 0;
      this.mode = 'demo'; // updated from /api/info
      this.el = {};       // DOM element references

      this._build();
      this._attachEvents();
      this._loadInfo();
      this._showWelcome();
    }

    // ── DOM Construction ────────────────────────────────────────────────────
    _build() {
      const root = document.getElementById('chat-widget-root') || document.body;

      // Launcher button
      this.el.launcher = this._html(`
        <button class="chat-launcher" id="chat-launcher" aria-label="Open support chat" aria-expanded="false">
          <span class="chat-launcher-icon chat-launcher-icon--open">💬</span>
          <span class="chat-launcher-icon chat-launcher-icon--close">✕</span>
        </button>
      `);

      // Chat window
      this.el.window = this._html(`
        <div class="chat-window" id="chat-window" role="dialog" aria-label="NovaTech support chat" aria-modal="true">

          <!-- Header -->
          <div class="chat-header">
            <div class="chat-avatar">
              🤖
              <div class="chat-avatar-status" title="Online"></div>
            </div>
            <div class="chat-header-info">
              <div class="chat-agent-name" id="chat-agent-name">
                Nova
                <span class="chat-mode-badge chat-mode-badge--demo" id="chat-mode-badge">Demo</span>
              </div>
              <div class="chat-agent-status">● Online</div>
            </div>
            <div class="chat-header-actions">
              <button class="chat-action-btn" id="chat-reset-btn" title="Reset conversation" aria-label="Reset conversation">🔄</button>
              <button class="chat-action-btn" id="chat-close-btn" title="Close chat" aria-label="Close chat">✕</button>
            </div>
          </div>

          <!-- Quick Chips -->
          <div class="quick-chips-bar" id="quick-chips" role="list">
            ${CHIPS.map(c => `<button class="chip" role="listitem" data-text="${c.text}">${c.label}</button>`).join('')}
          </div>

          <!-- Messages -->
          <div class="chat-messages" id="chat-messages" aria-live="polite" aria-label="Chat messages"></div>

          <!-- Input Area -->
          <div class="chat-input-area">
            <div class="chat-input-row">
              <textarea
                class="chat-input"
                id="chat-input"
                placeholder="Type a message…"
                rows="1"
                maxlength="${MAX_CHARS}"
                aria-label="Chat message input"
              ></textarea>
              <button class="chat-send-btn" id="chat-send-btn" aria-label="Send message" disabled>➤</button>
            </div>
            <div class="chat-input-footer">
              <span class="chat-char-count" id="chat-char-count">0 / ${MAX_CHARS}</span>
              <span class="chat-branding">Powered by Gemini ⚡</span>
            </div>
          </div>

        </div>
      `);

      root.appendChild(this.el.launcher);
      root.appendChild(this.el.window);

      // Cache commonly-used refs
      this.el.messages    = document.getElementById('chat-messages');
      this.el.input       = document.getElementById('chat-input');
      this.el.sendBtn     = document.getElementById('chat-send-btn');
      this.el.charCount   = document.getElementById('chat-char-count');
      this.el.modeBadge   = document.getElementById('chat-mode-badge');
      this.el.chips       = document.getElementById('quick-chips');
    }

    _html(str) {
      const tpl = document.createElement('template');
      tpl.innerHTML = str.trim();
      return tpl.content.firstChild;
    }

    // ── Event Binding ───────────────────────────────────────────────────────
    _attachEvents() {
      // Launcher toggle
      this.el.launcher.addEventListener('click', () => this.toggle());

      // Close button
      document.getElementById('chat-close-btn').addEventListener('click', () => this.close());

      // Reset button
      document.getElementById('chat-reset-btn').addEventListener('click', () => this.reset());

      // Send button
      this.el.sendBtn.addEventListener('click', () => this._send());

      // Input events
      this.el.input.addEventListener('input', () => this._onInput());
      this.el.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._send();
        }
      });

      // Quick chips
      this.el.chips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (chip) this.sendMessage(chip.dataset.text);
      });
    }

    _onInput() {
      const len = this.el.input.value.length;
      const hasText = len > 0;

      // Auto-resize textarea
      this.el.input.style.height = 'auto';
      this.el.input.style.height = Math.min(this.el.input.scrollHeight, 100) + 'px';

      // Update char count
      this.el.charCount.textContent = `${len} / ${MAX_CHARS}`;
      this.el.charCount.classList.toggle('is-warning', len > MAX_CHARS * 0.75);
      this.el.charCount.classList.toggle('is-danger', len >= MAX_CHARS);

      // Enable send button
      this.el.sendBtn.disabled = !hasText || this.isLoading;
    }

    // ── Widget State ────────────────────────────────────────────────────────
    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.isOpen = true;
      this.el.window.classList.add('is-open');
      this.el.launcher.classList.add('is-open');
      this.el.launcher.setAttribute('aria-expanded', 'true');
      this._clearBadge();
      setTimeout(() => this.el.input.focus(), 350);
      this._scrollBottom();
    }

    close() {
      this.isOpen = false;
      this.el.window.classList.remove('is-open');
      this.el.launcher.classList.remove('is-open');
      this.el.launcher.setAttribute('aria-expanded', 'false');
    }

    // ── Info Loader ─────────────────────────────────────────────────────────
    async _loadInfo() {
      try {
        const res = await fetch(`${API_BASE}/api/info`);
        if (!res.ok) return;
        const data = await res.json();
        this.mode = data.mode || 'demo';
        this._updateModeBadge();
      } catch {
        // Silently ignore — demo mode is already set
      }
    }

    _updateModeBadge() {
      const badge = this.el.modeBadge;
      if (!badge) return;
      if (this.mode === 'live') {
        badge.textContent = 'Live AI';
        badge.className = 'chat-mode-badge chat-mode-badge--live';
      } else {
        badge.textContent = 'Demo';
        badge.className = 'chat-mode-badge chat-mode-badge--demo';
      }
    }

    // ── Welcome Message ─────────────────────────────────────────────────────
    _showWelcome() {
      this._addSystemMsg(formatTime(new Date()));
      this._addBotMessage(
        "👋 **Hey there!** I'm **Nova**, your NovaTech support assistant.\n\n" +
        "I can help you with **orders**, **shipping**, **returns**, and more. Use the quick chips below or just type your question!"
      );
    }

    // ── Messaging ───────────────────────────────────────────────────────────
    _send() {
      const text = this.el.input.value.trim();
      if (!text || this.isLoading) return;
      this.sendMessage(text);
    }

    async sendMessage(text) {
      text = text.trim();
      if (!text) return;

      // Open widget if closed
      if (!this.isOpen) this.open();

      // Add user bubble
      this._addUserMessage(text);

      // Reset input
      this.el.input.value = '';
      this.el.input.style.height = 'auto';
      this._onInput();

      // Show typing indicator
      this.isLoading = true;
      this.el.sendBtn.disabled = true;
      const typingEl = this._showTyping();

      try {
        const res = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId, message: text }),
        });

        this._removeTyping(typingEl);

        if (res.status === 429) {
          this._addBotMessage("⚠️ You're sending messages a bit quickly! Please wait a moment and try again.");
          return;
        }

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();

        // Update mode badge if it changed
        if (data.mode && data.mode !== this.mode) {
          this.mode = data.mode;
          this._updateModeBadge();
        }

        this._addBotMessage(data.reply || "I'm sorry, I didn't receive a response. Please try again.");

        // Increment unread count if widget is closed
        if (!this.isOpen) this._incrementBadge();

      } catch (err) {
        this._removeTyping(typingEl);
        console.error('[ChatWidget] Error:', err);
        this._addBotMessage(
          "⚠️ I'm having trouble connecting right now. Please try again in a moment, or contact us at **support@novatech.com**."
        );
      } finally {
        this.isLoading = false;
        this.el.sendBtn.disabled = this.el.input.value.trim().length === 0;
        this.el.input.focus();
      }
    }

    // ── Message Renderers ───────────────────────────────────────────────────
    _addUserMessage(text) {
      const now = formatTime(new Date());
      const row = this._html(`
        <div class="msg-row msg-row--user">
          <div>
            <div class="msg-bubble">${this._escapeHTML(text)}</div>
            <div class="msg-time">${now}</div>
          </div>
          <div class="msg-avatar-sm msg-avatar-sm--user">👤</div>
        </div>
      `);
      this.el.messages.appendChild(row);
      this._scrollBottom();
    }

    _addBotMessage(text) {
      const now = formatTime(new Date());
      const row = this._html(`
        <div class="msg-row msg-row--bot">
          <div class="msg-avatar-sm">🤖</div>
          <div>
            <div class="msg-bubble">${parseMarkdown(text)}</div>
            <div class="msg-time">${now}</div>
          </div>
        </div>
      `);
      this.el.messages.appendChild(row);
      this._scrollBottom();
    }

    _addSystemMsg(text) {
      const el = this._html(`<div class="msg-system">${this._escapeHTML(text)}</div>`);
      this.el.messages.appendChild(el);
    }

    _showTyping() {
      const row = this._html(`
        <div class="msg-row msg-row--bot" id="typing-row">
          <div class="msg-avatar-sm">🤖</div>
          <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      `);
      this.el.messages.appendChild(row);
      this._scrollBottom();
      return row;
    }

    _removeTyping(el) {
      if (el && el.parentNode) el.remove();
    }

    // ── Reset ───────────────────────────────────────────────────────────────
    async reset() {
      try {
        await fetch(`${API_BASE}/api/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId }),
        });
      } catch { /* ignore */ }

      // Clear UI
      this.el.messages.innerHTML = '';
      this._showWelcome();
    }

    // ── Badge ────────────────────────────────────────────────────────────────
    _incrementBadge() {
      this.unreadCount++;
      let badge = document.querySelector('.chat-badge');
      if (!badge) {
        badge = this._html(`<span class="chat-badge" id="chat-badge">${this.unreadCount}</span>`);
        this.el.launcher.appendChild(badge);
      } else {
        badge.textContent = this.unreadCount;
      }
    }

    _clearBadge() {
      this.unreadCount = 0;
      const badge = document.querySelector('.chat-badge');
      if (badge) badge.remove();
    }

    // ── Scroll ──────────────────────────────────────────────────────────────
    _scrollBottom() {
      requestAnimationFrame(() => {
        this.el.messages.scrollTop = this.el.messages.scrollHeight;
      });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    _escapeHTML(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function init() {
    window.chatWidget = new ChatWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
