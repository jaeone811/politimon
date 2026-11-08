/*
 * 실시간 PvP 대전 채팅 (v1.2)
 * - AI 대전·튜토리얼에서는 표시하지 않고, 실시간 PvP 전투 화면에서만 나타납니다.
 * - #app 밖(body)에 붙여 전투 화면이 다시 그려져도 입력 중인 글과 대화가 유지됩니다.
 * - 메시지는 DB에 저장하지 않고 Supabase Realtime Broadcast로만 주고받으며,
 *   새로고침 대비로 같은 탭의 sessionStorage에만 최근 대화를 보관합니다.
 */
(() => {
  const MAX_LENGTH = 200;
  const MAX_HISTORY = 120;
  const GROUP_GAP_MS = 2 * 60 * 1000;
  const DIVIDER_GAP_MS = 10 * 60 * 1000;
  const BURST_WINDOW_MS = 5000;
  const BURST_LIMIT = 5;
  const MIN_INTERVAL_MS = 450;
  const QUICK_EMOJIS = ["👍", "😂", "😮", "😡", "🔥", "🙏", "👏", "😭"];
  const QUICK_PHRASES = ["잘 부탁해요!", "GG", "ㅋㅋㅋㅋ", "한 수 배웠습니다", "잠시만요"];
  const ICON_DIRECT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.2 3.1 2.9 9.4a.6.6 0 0 0 0 1.1l7.2 3 3 7.2a.6.6 0 0 0 1.1 0l6.3-18.3a.6.6 0 0 0-.8-.8Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="m10.1 13.5 5.4-5.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
  const ICON_EXPAND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_SHRINK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10h-6V4M4 14h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const ICON_SMILE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.3 14.2a4.4 4.4 0 0 0 7.4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="9.8" r="1.2" fill="currentColor"/><circle cx="15" cy="9.8" r="1.2" fill="currentColor"/></svg>`;

  let chat = null;

  const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const initial = name => Array.from(String(name || "?").trim())[0]?.toUpperCase() || "?";
  const cleanText = value => String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+\n/g, "\n").trim().slice(0, MAX_LENGTH);
  const emojiOnly = text => { const glyphs = text.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu) || []; return glyphs.length > 0 && glyphs.length <= 3 && text.replace(/\p{Extended_Pictographic}|️|‍|\s/gu, "") === ""; };
  const timeLabel = at => new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(new Date(at));
  const storageKey = key => `politimon-pvp-chat-v1:${key}`;
  const loadHistory = key => { try { const list = JSON.parse(sessionStorage.getItem(storageKey(key)) || "[]"); return Array.isArray(list) ? list.filter(item => item && item.id && item.text).map(item => item.status === "sending" ? { ...item, status: "failed" } : item) : []; } catch { return []; } };
  const saveHistory = () => { if (!chat) return; try { sessionStorage.setItem(storageKey(chat.key), JSON.stringify(chat.messages.slice(-MAX_HISTORY))); } catch {} };

  function currentContext() {
    const session = typeof pvpSession !== "undefined" ? pvpSession : null;
    const currentRoute = typeof route !== "undefined" ? route : "";
    const user = typeof currentUser === "function" ? currentUser() : null;
    if (!session?.matchId || !session.roomId || currentRoute !== "game" || !user || !window.politimonBackend?.openChat) return null;
    const members = Array.isArray(session.members) ? session.members : [];
    const seat = session.seat === 1 ? 1 : 0;
    const me = members[seat] || { user_id: user.id, display_name: "나" };
    const opponent = members[1 - seat] || { user_id: "", display_name: "상대" };
    return { key: `${session.roomId}:${session.matchId}`, roomId: session.roomId, me: { id: me.user_id || user.id, name: me.display_name || "나" }, opponent: { id: opponent.user_id || "", name: opponent.display_name || "상대" } };
  }

  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }

  function avatar(name, size = "") { const node = el("span", `pvp-chat-avatar${size ? ` ${size}` : ""}`, initial(name)); node.setAttribute("aria-hidden", "true"); return node; }

  function mount(context) {
    const root = el("aside", "pvp-chat");
    root.dataset.state = "collapsed";
    root.dataset.size = "normal";
    root.innerHTML = `
      <div class="pvp-chat-peek" hidden><b></b><span></span></div>
      <button class="pvp-chat-pill" type="button" aria-label="대전 채팅 열기">
        <span class="pvp-chat-pill-icon">${ICON_DIRECT}</span><span class="pvp-chat-pill-label">메시지</span>
        <span class="pvp-chat-pill-faces"></span><i class="pvp-chat-badge" hidden>0</i>
      </button>
      <section class="pvp-chat-panel" role="dialog" aria-label="대전 채팅" hidden>
        <header class="pvp-chat-head">
          <div class="pvp-chat-who"><span class="pvp-chat-head-avatar"></span><div><b class="pvp-chat-name"></b><small class="pvp-chat-status">연결 중…</small></div></div>
          <div class="pvp-chat-tools"><button type="button" class="pvp-chat-size" aria-label="채팅창 크게 보기">${ICON_EXPAND}</button><button type="button" class="pvp-chat-close" aria-label="채팅창 접기">${ICON_CLOSE}</button></div>
        </header>
        <div class="pvp-chat-body" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="pvp-chat-quick" hidden></div>
        <form class="pvp-chat-compose" autocomplete="off">
          <button type="button" class="pvp-chat-emoji" aria-label="빠른 이모지·문구" aria-expanded="false">${ICON_SMILE}</button>
          <input class="pvp-chat-input" type="text" maxlength="${MAX_LENGTH}" placeholder="메시지 입력..." aria-label="메시지 입력" enterkeyhint="send">
          <button type="submit" class="pvp-chat-send" disabled>보내기</button>
        </form>
      </section>`;
    document.body.appendChild(root);

    const refs = {
      root,
      pill: root.querySelector(".pvp-chat-pill"),
      faces: root.querySelector(".pvp-chat-pill-faces"),
      badge: root.querySelector(".pvp-chat-badge"),
      peek: root.querySelector(".pvp-chat-peek"),
      panel: root.querySelector(".pvp-chat-panel"),
      headAvatar: root.querySelector(".pvp-chat-head-avatar"),
      name: root.querySelector(".pvp-chat-name"),
      status: root.querySelector(".pvp-chat-status"),
      size: root.querySelector(".pvp-chat-size"),
      close: root.querySelector(".pvp-chat-close"),
      body: root.querySelector(".pvp-chat-body"),
      quick: root.querySelector(".pvp-chat-quick"),
      form: root.querySelector(".pvp-chat-compose"),
      emoji: root.querySelector(".pvp-chat-emoji"),
      input: root.querySelector(".pvp-chat-input"),
      send: root.querySelector(".pvp-chat-send")
    };

    QUICK_EMOJIS.forEach(emoji => { const button = el("button", "pvp-chat-chip emoji", emoji); button.type = "button"; button.dataset.quick = emoji; refs.quick.appendChild(button); });
    QUICK_PHRASES.forEach(phrase => { const button = el("button", "pvp-chat-chip", phrase); button.type = "button"; button.dataset.quick = phrase; refs.quick.appendChild(button); });

    chat = { ...context, refs, messages: loadHistory(context.key), unread: 0, open: false, connection: null, status: "connecting", sentAt: [], peekTimer: null };
    applyIdentity();
    renderMessages({ forceBottom: true });

    refs.pill.addEventListener("click", () => setOpen(true));
    refs.close.addEventListener("click", () => setOpen(false));
    refs.size.addEventListener("click", () => {
      const wide = root.dataset.size !== "wide";
      root.dataset.size = wide ? "wide" : "normal";
      refs.size.innerHTML = wide ? ICON_SHRINK : ICON_EXPAND;
      refs.size.setAttribute("aria-label", wide ? "채팅창 작게 보기" : "채팅창 크게 보기");
      scrollToBottom();
    });
    refs.emoji.addEventListener("click", () => toggleQuick());
    refs.quick.addEventListener("click", event => { const chip = event.target.closest("[data-quick]"); if (!chip) return; sendText(chip.dataset.quick); toggleQuick(false); refs.input.focus(); });
    refs.input.addEventListener("input", () => { refs.send.disabled = !cleanText(refs.input.value); });
    refs.input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    });
    refs.form.addEventListener("submit", event => {
      event.preventDefault();
      // 한글 조합 중 Enter가 두 번 전송되지 않도록 조합 완료 뒤에만 보냅니다.
      if (event.isComposing || refs.input.dataset.composing === "1") return;
      if (sendText(refs.input.value)) { refs.input.value = ""; refs.send.disabled = true; }
    });
    refs.input.addEventListener("compositionstart", () => { refs.input.dataset.composing = "1"; });
    refs.input.addEventListener("compositionend", () => { refs.input.dataset.composing = "0"; refs.send.disabled = !cleanText(refs.input.value); });
    refs.body.addEventListener("click", event => { const retry = event.target.closest("[data-retry]"); if (retry) retrySend(retry.dataset.retry); });
    refs.peek.addEventListener("click", () => setOpen(true));

    chat.connection = window.politimonBackend.openChat(context.roomId, { onMessage: receive, onStatus: setStatus });
  }

  function applyIdentity() {
    const { refs, opponent, me } = chat;
    refs.faces.replaceChildren(avatar(opponent.name, "sm"), avatar(me.name, "sm self"));
    refs.headAvatar.replaceChildren(avatar(opponent.name));
    refs.name.textContent = opponent.name;
  }

  function unmount() {
    if (!chat) return;
    chat.connection?.close();
    clearTimeout(chat.peekTimer);
    chat.refs.root.remove();
    chat = null;
  }

  function setStatus(next) {
    if (!chat) return;
    chat.status = next;
    chat.refs.root.dataset.connection = next;
    chat.refs.status.textContent = next === "connected" ? "실시간 대전 상대 · 연결됨" : next === "offline" ? "연결 끊김 · 다시 연결 중" : "연결 중…";
    if (next === "offline") setTimeout(() => { if (chat?.status === "offline") reconnect(); }, 3000);
  }

  function reconnect() {
    if (!chat) return;
    chat.connection?.close();
    chat.status = "connecting";
    chat.refs.status.textContent = "연결 중…";
    chat.connection = window.politimonBackend.openChat(chat.roomId, { onMessage: receive, onStatus: setStatus });
  }

  function setOpen(open) {
    if (!chat) return;
    chat.open = open;
    chat.refs.root.dataset.state = open ? "open" : "collapsed";
    chat.refs.panel.hidden = !open;
    chat.refs.pill.hidden = open;
    if (open) {
      chat.unread = 0;
      updateBadge();
      hidePeek();
      renderMessages({ forceBottom: true });
      if (!matchMedia("(pointer: coarse)").matches) chat.refs.input.focus({ preventScroll: true });
    } else {
      toggleQuick(false);
      chat.refs.pill.focus({ preventScroll: true });
    }
  }

  function toggleQuick(force) {
    if (!chat) return;
    const show = typeof force === "boolean" ? force : chat.refs.quick.hidden;
    chat.refs.quick.hidden = !show;
    chat.refs.emoji.setAttribute("aria-expanded", String(show));
    chat.refs.emoji.classList.toggle("active", show);
  }

  function updateBadge() {
    const { badge, root } = chat.refs;
    badge.hidden = chat.unread === 0;
    badge.textContent = chat.unread > 9 ? "9+" : String(chat.unread);
    root.classList.toggle("has-unread", chat.unread > 0);
  }

  function showPeek(message) {
    const { peek } = chat.refs;
    peek.querySelector("b").textContent = chat.opponent.name;
    peek.querySelector("span").textContent = message.text;
    peek.hidden = false;
    peek.classList.remove("show");
    void peek.offsetWidth;
    peek.classList.add("show");
    clearTimeout(chat.peekTimer);
    chat.peekTimer = setTimeout(hidePeek, 4200);
  }

  function hidePeek() { if (!chat) return; clearTimeout(chat.peekTimer); chat.refs.peek.hidden = true; chat.refs.peek.classList.remove("show"); }

  function rateLimited() {
    const now = Date.now();
    chat.sentAt = chat.sentAt.filter(at => now - at < BURST_WINDOW_MS);
    const last = chat.sentAt[chat.sentAt.length - 1] || 0;
    if (now - last < MIN_INTERVAL_MS || chat.sentAt.length >= BURST_LIMIT) return true;
    chat.sentAt.push(now);
    return false;
  }

  function sendText(raw) {
    if (!chat) return false;
    const text = cleanText(raw);
    if (!text) return false;
    if (rateLimited()) { if (typeof notify === "function") notify("메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도하세요."); return false; }
    const message = { id: randomId(), uid: chat.me.id, name: chat.me.name, text, at: new Date().toISOString(), status: "sending" };
    chat.messages.push(message);
    trimHistory();
    renderMessages({ forceBottom: true });
    deliver(message);
    return true;
  }

  async function deliver(message) {
    const connection = chat?.connection;
    try {
      await connection.send({ id: message.id, uid: message.uid, name: message.name, text: message.text, at: message.at });
      message.status = "sent";
    } catch (error) {
      message.status = "failed";
      console.warn("PvP chat send failed", error);
    }
    if (chat) { saveHistory(); renderMessages(); }
  }

  function retrySend(id) {
    const message = chat?.messages.find(item => item.id === id && item.status === "failed");
    if (!message) return;
    message.status = "sending";
    renderMessages();
    deliver(message);
  }

  function receive(payload) {
    if (!chat) return;
    const text = cleanText(payload.text);
    const id = String(payload.id || "").slice(0, 80);
    // 같은 방 상대의 메시지만 받고, 내 계정으로 위장한 메시지나 중복 수신은 무시합니다.
    if (!text || !id || !chat.opponent.id || payload.uid !== chat.opponent.id || chat.messages.some(item => item.id === id)) return;
    const sentAt = Date.parse(payload.at);
    const message = { id, uid: chat.opponent.id, name: chat.opponent.name, text, at: Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) < 6e5 ? new Date(sentAt).toISOString() : new Date().toISOString(), status: "sent" };
    chat.messages.push(message);
    trimHistory();
    saveHistory();
    if (!chat.open) { chat.unread += 1; updateBadge(); showPeek(message); }
    renderMessages();
  }

  function trimHistory() { if (chat.messages.length > MAX_HISTORY) chat.messages.splice(0, chat.messages.length - MAX_HISTORY); }

  function nearBottom() { const { body } = chat.refs; return body.scrollHeight - body.scrollTop - body.clientHeight < 80; }
  function scrollToBottom() { if (!chat) return; const { body } = chat.refs; requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; }); }

  function renderMessages({ forceBottom = false } = {}) {
    if (!chat) return;
    const { body } = chat.refs;
    const stick = forceBottom || nearBottom();
    const fragment = document.createDocumentFragment();

    const intro = el("div", "pvp-chat-intro");
    intro.append(avatar(chat.opponent.name, "lg"), el("b", "", chat.opponent.name), el("span", "", "실시간 대전 상대"), el("small", "", "이 대화는 저장되지 않으며 이번 대전 참가자에게만 보입니다. 상대를 존중해 주세요."));
    fragment.appendChild(intro);

    chat.messages.forEach((message, index) => {
      const prev = chat.messages[index - 1];
      const next = chat.messages[index + 1];
      const at = Date.parse(message.at);
      if (!prev || at - Date.parse(prev.at) >= DIVIDER_GAP_MS) fragment.appendChild(el("div", "pvp-chat-divider", timeLabel(at)));
      const mine = message.uid === chat.me.id;
      const joinsPrev = prev && prev.uid === message.uid && at - Date.parse(prev.at) < GROUP_GAP_MS && !(at - Date.parse(prev.at) >= DIVIDER_GAP_MS);
      const joinsNext = next && next.uid === message.uid && Date.parse(next.at) - at < GROUP_GAP_MS;
      const row = el("div", `pvp-chat-row ${mine ? "mine" : "theirs"}${joinsPrev ? " joins-prev" : ""}${joinsNext ? " joins-next" : ""}${message.status !== "sent" ? ` ${message.status}` : ""}`);
      if (!mine) row.appendChild(joinsNext ? el("span", "pvp-chat-avatar-spacer") : avatar(message.name, "sm"));
      const bubble = el("p", `pvp-chat-bubble${emojiOnly(message.text) ? " emoji-only" : ""}`, message.text);
      bubble.title = timeLabel(at);
      row.appendChild(bubble);
      fragment.appendChild(row);
      if (mine && message.status === "failed") {
        const fail = el("div", "pvp-chat-meta failed");
        const retry = el("button", "", "다시 보내기");
        retry.type = "button";
        retry.dataset.retry = message.id;
        fail.append(el("span", "", "전송 실패 · "), retry);
        fragment.appendChild(fail);
      } else if (mine && !next && message.status === "sent") {
        fragment.appendChild(el("div", "pvp-chat-meta", "전송됨"));
      }
    });

    body.replaceChildren(fragment);
    if (stick) scrollToBottom();
  }

  window.syncPvpChat = function syncPvpChat() {
    const context = currentContext();
    if (!context) { unmount(); return; }
    if (chat && chat.key !== context.key) unmount();
    if (!chat) { mount(context); return; }
    if (chat.opponent.name !== context.opponent.name || chat.me.name !== context.me.name || chat.opponent.id !== context.opponent.id) {
      chat.opponent = context.opponent;
      chat.me = context.me;
      applyIdentity();
      renderMessages();
    }
  };

  window.addEventListener("hashchange", () => setTimeout(() => window.syncPvpChat(), 0));
  window.syncPvpChat();
})();
