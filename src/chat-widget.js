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
        /* Face crop from portrait-hero-santa.png (480x438). The head sits at about
           54% across and 28% down, so the image is scaled up and offset to
           put it in the middle of the circle. Adjust size/position together
           if the artwork is ever replaced. */
        background-image: url('./portrait-hero-santa.png');
        background-repeat: no-repeat;
        background-size: 280%;
        background-position: 56% 8%;
      }
      #chat-toggle:hover { transform: scale(1.1); }
      #chat-window {
        display: none;
        position: fixed;
        bottom: 100px;
        right: 24px;
        width: 380px;
        /* 380 + 24 right margin is 404px. A phone is 360 to 414px wide, so the
           fixed width pushed the left edge off the screen. The cap keeps a
           16px margin on the left whatever the screen measures. */
        max-width: calc(100vw - 40px);
        max-height: 500px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        z-index: 998;
        border-top: 4px solid var(--gold);
      }
      #chat-window.open { display: flex; flex-direction: column; }

      /* On a phone the window spans the full width between two equal margins
         and its height follows the visible viewport, so the browser chrome
         and the on-screen keyboard cannot push the input field out of reach.
         100dvh is the dynamic height; the vh line below is the fallback for
         browsers that do not know it. */
      @media (max-width: 640px) {
        #chat-window {
          left: 16px;
          right: 16px;
          width: auto;
          max-width: none;
          bottom: 88px;
          max-height: calc(100vh - 150px);
          max-height: calc(100dvh - 150px);
        }
        #chat-toggle { bottom: 16px; right: 16px; }
      }
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
        /* Relative, not a fixed 280px: the window is narrower on a phone, and
           a bubble wider than its container would scroll sideways. */
        max-width: 85%;
        padding: 10px 12px;
        border-radius: 6px;
        line-height: 1.4;
        /* A pasted order number or a long Cebuano compound has no space to
           break at and would otherwise widen the bubble past the window. */
        overflow-wrap: anywhere;
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
      #chat-psalm {
        padding: 12px 16px;
        background: #FBF8F0;
        border-bottom: 1px solid #EDE4CC;
        font-family: Georgia, Garamond, serif;
        font-size: 13px;
        line-height: 1.5;
        color: #4A4A4A;
        font-style: italic;
      }
      #chat-psalm .ref {
        display: block;
        margin-top: 5px;
        font-style: normal;
        font-size: 11px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--gold);
        font-family: system-ui, sans-serif;
      }
      .loading { opacity: 0.6; }
    </style>
    <div id="chat-toggle" role="button" tabindex="0" aria-label="Open chat"></div>
    <div id="chat-window">
      <div id="chat-header">
        Mrs. Penky Support
        <div class="subtitle">Products, orders &amp; shipping</div>
      </div>
      <div id="chat-psalm" hidden></div>
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
      // The Pages Function expects { message, history } and answers with
      // { message }. The widget used to send { messages } and read data.reply,
      // so every request was rejected as invalid and every answer discarded --
      // which looked exactly like a broken AI binding.
      const res = await fetch(CHAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          // Everything before this turn, minus the greeting we injected
          // ourselves, capped to keep the prompt small.
          history: messages.slice(0, -1).slice(-8),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Surface what the server actually said instead of a generic line.
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const reply = (data.message || '').trim();
      if (!reply) throw new Error('Empty reply from server');

      messages.push({ role: 'assistant', content: reply });
      renderMessages();
    } catch (err) {
      console.error('Chat error:', err);
      // Only shown when the request genuinely failed. Everything the bot can
      // answer, it answers -- the email address belongs in the failure case,
      // not in ordinary replies.
      //
      // Note for local testing: opening this file over file:// means there is
      // no /api/chat to call, so this branch always fires with "Failed to
      // fetch". That is the protocol, not a broken bot.
      const detail = (err && err.message) ? ` (${err.message})` : '';
      messages.push({ role: 'assistant', content: "Pasensya na — I can't reach our system right now" + detail + ". Please try again in a moment. If it keeps failing, write to mrs.penkys.webshop@gmail.com and we will answer there." });
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

  // Psalm of the day, shown above the greeting. Provided by psalms.js; if that
  // file is missing the block simply stays hidden and the chat still works.
  const psalmBox = document.getElementById('chat-psalm');
  const psalm = window.PSALM_OF_THE_DAY;
  if (psalm && psalm.text) {
    psalmBox.textContent = '\u201C' + psalm.text + '\u201D';
    const ref = document.createElement('span');
    ref.className = 'ref';
    ref.textContent = psalm.ref;
    psalmBox.appendChild(ref);
    psalmBox.hidden = false;
  }

  // Opening line. Shown once when there is no stored conversation, so the
  // customer is greeted and told what the assistant can actually do instead
  // of facing an empty box.
  const GREETING =
    "Maayong adlaw, and welcome to Mrs. Penky's! I can help you look for " +
    "crosses, rosaries, bracelets or lights, check on an order, or answer " +
    "questions about shipping and payment. Pwede ka mangutana sa Bisaya o " +
    "English \u2014 kung asa ka komportable. How can I help you po?";

  // Load conversation history from localStorage
  const HISTORY_KEY = 'chat-history-v2';
  // Key bumped: v1 entries carry the old greeting and the old request shape.
  try { localStorage.removeItem('chat-history'); } catch (e) {}
  const saved = localStorage.getItem(HISTORY_KEY);
  if (saved) {
    try { messages = JSON.parse(saved) || []; } catch (e) { messages = []; }
  }
  if (!messages.length) {
    messages.push({ role: 'assistant', content: GREETING });
  }
  renderMessages();

  // Save conversation on every message
  setInterval(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-10)));
  }, 1000);
})();
