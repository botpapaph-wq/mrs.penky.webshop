(function() {
  // chat.js is a Cloudflare Pages Function, served from this same origin
  // at /api/chat -- not from Supabase.
  const CHAT_API = '/api/chat';

  // Create widget container
  const widget = document.createElement('div');
  widget.id = 'mrs-penky-chat-widget';
  widget.innerHTML = `
    <style>
      #mrs-penky-chat-widget { --gold: #D4AF37; --navy: #1C2541; }
      #chat-toggle {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background-color: var(--navy);
        border: 3px solid var(--gold);
        color: white;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999;
        transition: transform 0.2s;
        font-family: Georgia, Garamond, serif;
        overflow: hidden;
        padding: 0;
        /* Face crop from portrait-hero.png (480x438). The head sits at about
           54% across and 28% down, so the image is scaled up and offset to
           put it in the middle of the circle. Adjust size/position together
           if the artwork is ever replaced. */
        background-image: url('./portrait-hero.png');
        background-repeat: no-repeat;
        background-size: 262%;
        background-position: 56% 12%;
      }
      #chat-toggle:hover { transform: scale(1.1); }
      #chat-window {
        display: none;
        position: fixed;
        bottom: 100px;
        right: 24px;
        width: 380px;
        max-height: 500px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        z-index: 998;
        border-top: 4px solid var(--gold);
      }
      #chat-window.open { display: flex; flex-direction: column; }
      #chat-header {
        background-color: var(--navy);
        color: white;
        padding: 16px;
        font-weight: bold;
        font-size: 14px;
        border-radius: 4px 4px 0 0;
      }
      #chat-header .subtitle {
        font-size: 12px;
        opacity: 0.85;
        margin-top: 4px;
        color: var(--gold);
        font-weight: normal;
      }
      #chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        font-size: 13px;
        max-height: 380px;
      }
      .message {
        margin-bottom: 12px;
        display: flex;
        gap: 8px;
      }
      .message.user { justify-content: flex-end; }
      .message.assistant { justify-content: flex-start; }
      .message-bubble {
        max-width: 280px;
        padding: 10px 12px;
        border-radius: 6px;
        line-height: 1.4;
      }
      .message.assistant .message-bubble {
        background-color: #f0f0f0;
        color: var(--navy);
        border-left: 3px solid var(--gold);
      }
      .message.user .message-bubble {
        background-color: var(--navy);
        color: white;
      }
      #chat-input-area {
        padding: 12px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        gap: 8px;
      }
      #chat-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 13px;
        font-family: inherit;
      }
      #chat-input:focus { outline: none; border-color: var(--gold); }
      #chat-send {
        padding: 8px 16px;
        background-color: var(--navy);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background-color 0.2s;
      }
      #chat-send:hover { background-color: var(--gold); color: var(--navy); }
      .loading { opacity: 0.6; }
    </style>
    <div id="chat-toggle" role="button" tabindex="0" aria-label="Open chat"></div>
    <div id="chat-window">
      <div id="chat-header">
        Mrs. Penky Support
        <div class="subtitle">Products, orders &amp; shipping</div>
      </div>
      <div id="chat-messages"></div>
      <div id="chat-input-area">
        <input id="chat-input" type="text" placeholder="Ask about our products..." />
        <button id="chat-send">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  const toggle = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const messagesDiv = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  let messages = [];

  toggle.addEventListener('click', () => {
    chatWindow.classList.toggle('open');
    if (chatWindow.classList.contains('open')) input.focus();
  });

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    messages.push({ role: 'user', content: text });
    renderMessages();

    sendBtn.disabled = true;
    sendBtn.classList.add('loading');

    try {
      const res = await fetch(CHAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });

      const data = await res.json();
      const reply = data.reply || 'I apologize, I could not process that request.';
      messages.push({ role: 'assistant', content: reply });
      renderMessages();
    } catch (err) {
      console.error('Chat error:', err);
      messages.push({ role: 'assistant', content: "Sorry, I can't reach our system right now. Please try again in a moment, or email us at mrs.penkys.webshop@gmail.com." });
      renderMessages();
    }

    sendBtn.disabled = false;
    sendBtn.classList.remove('loading');
  }

  function renderMessages() {
    messagesDiv.innerHTML = messages
      .map((msg) => `
        <div class="message ${msg.role}">
          <div class="message-bubble">${escapeHtml(msg.content)}</div>
        </div>
      `)
      .join('');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Opening line. Shown once when there is no stored conversation, so the
  // customer is greeted and told what the assistant can actually do instead
  // of facing an empty box.
  const GREETING =
    "Maayong adlaw, and welcome to Mrs. Penky's! I'm here to help you look " +
    "for crosses, rosaries, bracelets or lights, check on an order, or answer " +
    "questions about shipping and payment. How can I help you po?";

  // Load conversation history from localStorage
  const saved = localStorage.getItem('chat-history');
  if (saved) {
    try { messages = JSON.parse(saved) || []; } catch (e) { messages = []; }
  }
  if (!messages.length) {
    messages.push({ role: 'assistant', content: GREETING });
  }
  renderMessages();

  // Save conversation on every message
  setInterval(() => {
    localStorage.setItem('chat-history', JSON.stringify(messages.slice(-10)));
  }, 1000);
})();
