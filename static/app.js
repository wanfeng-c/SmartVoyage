/* ==========================================================================
   SmartVoyage · 冰雪幻想前端
   零外部依赖：图标内联、Markdown 自研、粒子 Canvas、动效 CSS + rAF
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 0. 基础工具                                                          */
  /* ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  };

  const icon = (id, cls = "") =>
    `<svg class="icon ${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`;

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const pad2 = (n) => String(n).padStart(2, "0");
  const timeNow = () => {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

  function stamp(value) {
    if (!value) return timeNow();
    const m = String(value).match(/(\d{1,2}):(\d{2})/);
    return m ? `${pad2(m[1])}:${m[2]}` : timeNow();
  }

  function prettyDate(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso || "—";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return `${Number(m[2])}月${Number(m[3])}日 · 周${WEEK[d.getDay()]}`;
  }

  const uid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  /* ------------------------------------------------------------------ */
  /* 1. DOM 引用                                                          */
  /* ------------------------------------------------------------------ */
  const dom = {
    body: document.body,
    scenePhoto: $("#scenePhoto"),
    pointerGlow: $("#pointerGlow"),
    rail: $("#rail"),
    insight: $("#insight"),
    stage: $("#stage"),
    stageScroll: $("#stageScroll"),
    welcome: $("#welcome"),
    thread: $("#thread"),
    messages: $("#messages"),
    threadCount: $("#threadCount"),
    sessionTitle: $("#sessionTitle"),
    sessionList: $("#sessionList"),
    historyCount: $("#historyCount"),
    newChat: $("#newChat"),
    refreshSessions: $("#refreshSessions"),
    composer: $("#composer"),
    input: $("#input"),
    send: $("#send"),
    composerState: $("#composerState"),
    apiChip: $("#apiChip"),
    apiChipText: $("#apiChipText"),
    clockLabel: $("#clockLabel"),
    todayLabel: $("#todayLabel"),
    toasts: $("#toasts"),
    announcer: $("#announcer"),
    scrim: $("#scrim"),
    railToggle: $("#railToggle"),
    insightToggle: $("#insightToggle"),
    statusTag: $("#statusTag"),
    statusList: $("#statusList"),
    wx: $("#wx"),
    wxEmpty: $("#wxEmpty"),
    wxTag: $("#wxTag"),
    wxCity: $("#wxCity"),
    wxRegion: $("#wxRegion"),
    wxCond: $("#wxCond"),
    wxRange: $("#wxRange"),
    wxDate: $("#wxDate"),
    wxGlyph: $("#wxGlyph"),
    wxNow: $("#wxNow"),
    wxFeels: $("#wxFeels"),
    wxHumidity: $("#wxHumidity"),
    wxWindDir: $("#wxWindDir"),
    wxWind: $("#wxWind"),
    wxPrecip: $("#wxPrecip"),
    wxSource: $("#wxSource"),
    inspireKicker: $("#inspireKicker"),
    inspireTitle: $("#inspireTitle"),
    inspireText: $("#inspireText"),
  };

  /* ------------------------------------------------------------------ */
  /* 2. 状态                                                             */
  /* ------------------------------------------------------------------ */
  const STORE_KEY = "smartvoyage:session";

  const state = {
    sessionId: null,
    streaming: false,
    abort: null,
    sessions: [],
    sessionsPainted: false,
    messageCount: 0,
    weather: null,
  };

  /* 13 个 MCP 工具的中文名、图标与所属服务 */
  const TOOLS = {
    get_weather: { zh: "天气查询", icon: "i-cloud-sun", svc: "weather" },
    search_flights: { zh: "机票查询", icon: "i-plane", svc: "ticket" },
    search_trains: { zh: "火车票查询", icon: "i-train", svc: "ticket" },
    search_concerts: { zh: "演唱会查询", icon: "i-music", svc: "ticket" },
    book_flight: { zh: "机票预订", icon: "i-plane", svc: "ticket" },
    book_train: { zh: "火车票预订", icon: "i-train", svc: "ticket" },
    book_concert: { zh: "演唱会预订", icon: "i-music", svc: "ticket" },
    search_car_rental: { zh: "租车查询", icon: "i-car", svc: "travel" },
    search_insurance: { zh: "保险查询", icon: "i-shield", svc: "travel" },
    search_tour_groups: { zh: "旅游团检索", icon: "i-users", svc: "travel" },
    book_car_rental: { zh: "租车预订", icon: "i-car", svc: "travel" },
    book_tour_group: { zh: "旅游团预订", icon: "i-users", svc: "travel" },
    book_insurance: { zh: "保险预订", icon: "i-shield", svc: "travel" },
  };

  const ARG_LABELS = {
    city: "城市", date: "日期", origin: "出发", destination: "目的",
    pickup_date: "取车", days: "天数", flight_no: "航班", train_no: "车次",
    passenger: "乘客", id_card: "证件", seat_type: "席别", concert_name: "演出",
    ticket_type: "票档", quantity: "张数", car_model: "车型", group_name: "线路",
    people: "人数", depart_date: "出发日期", plan_name: "产品",
  };

  const FIELD_LABELS = {
    flight_number: "航班", train_number: "车次",
    departure_city: "始发", arrival_city: "终到",
    departure_time: "发车", arrival_time: "抵达",
    cabin_type: "舱位", seat_type: "席别",
    remaining_seats: "余票", price: "价格", price_per_day: "日租", total_price: "总价",
    artist: "艺人", venue: "场馆", start_time: "开演", end_time: "结束",
    city: "城市", company: "公司", car_model: "车型", car_type: "车型",
    transmission: "变速箱", seats: "座位", deposit: "押金", total_available: "可用",
    insurance_type: "类型", name: "名称", max_coverage: "最高保额", coverage: "保障",
    duration_days: "天数", tour_name: "线路", agency: "旅行社", rating: "评分",
    highlights: "亮点", days: "天数", similarity: "相似度",
  };

  const SVC_LABELS = {
    api: { checking: "检测中", ok: "在线", error: "离线" },
    agent: { idle: "未检测", checking: "请求中", ok: "在线", error: "异常" },
    weather: { idle: "未检测", checking: "调用中", ok: "已验证", error: "异常" },
    ticket: { idle: "未检测", checking: "调用中", ok: "已验证", error: "异常" },
    travel: { idle: "未检测", checking: "调用中", ok: "已验证", error: "异常" },
  };

  /* ------------------------------------------------------------------ */
  /* 3. Markdown 渲染                                                     */
  /* ------------------------------------------------------------------ */
  function inline(text) {
    const codes = [];
    let out = String(text).replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });

    out = out
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, href) => {
        const safe = href.replace(/"/g, "%22");
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\b__([^_]+)__\b/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>");

    out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
    return out;
  }

  function splitRow(row) {
    return row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function renderTable(rows) {
    const head = splitRow(rows[0]);
    const body = rows.slice(2).map(splitRow);
    const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
    const trs = body
      .map((row) => `<tr>${head.map((_, i) => `<td>${inline(row[i] || "")}</td>`).join("")}</tr>`)
      .join("");
    return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  function renderMarkdown(src) {
    /* 模型偶尔把标题写在句号同一行，先补一个换行，避免出现裸 "#" */
    const normalized = String(src).replace(/([。！？!?；;])\s*(#{1,6}\s+)/g, "$1\n\n$2");
    const lines = escapeHtml(normalized).split("\n");
    const out = [];
    let i = 0;
    let listType = null;
    let paragraph = [];

    const closeList = () => {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };
    const closeParagraph = () => {
      if (paragraph.length) {
        out.push(`<p>${paragraph.join("<br>")}</p>`);
        paragraph = [];
      }
    };
    const closeAll = () => {
      closeParagraph();
      closeList();
    };

    while (i < lines.length) {
      const line = lines[i];

      /* 代码块 */
      if (/^\s*```/.test(line)) {
        closeAll();
        const code = [];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          code.push(lines[i]);
          i += 1;
        }
        i += 1;
        out.push(`<pre><code>${code.join("\n")}</code></pre>`);
        continue;
      }

      /* 表格：当前行以 | 开头且下一行是分隔线 */
      if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
        closeAll();
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          rows.push(lines[i]);
          i += 1;
        }
        out.push(renderTable(rows));
        continue;
      }

      /* 标题 */
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeAll();
        const level = Math.min(heading[1].length + 2, 6);
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        i += 1;
        continue;
      }

      /* 分割线 */
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        closeAll();
        out.push("<hr>");
        i += 1;
        continue;
      }

      /* 引用（源码已转义，> 会变成 &gt;） */
      if (/^\s*(?:&gt;|>)\s?/.test(line)) {
        closeAll();
        const quote = [];
        while (i < lines.length && /^\s*(?:&gt;|>)\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*(?:&gt;|>)\s?/, ""));
          i += 1;
        }
        out.push(`<blockquote>${inline(quote.join("<br>"))}</blockquote>`);
        continue;
      }

      /* 无序列表 */
      if (/^\s*[-*+]\s+/.test(line)) {
        closeParagraph();
        if (listType !== "ul") {
          closeList();
          out.push("<ul>");
          listType = "ul";
        }
        out.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
        i += 1;
        continue;
      }

      /* 有序列表 */
      if (/^\s*\d+[.)]\s+/.test(line)) {
        closeParagraph();
        if (listType !== "ol") {
          closeList();
          out.push("<ol>");
          listType = "ol";
        }
        out.push(`<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
        i += 1;
        continue;
      }

      /* 空行 */
      if (!line.trim()) {
        closeAll();
        i += 1;
        continue;
      }

      /* 段落 */
      closeList();
      paragraph.push(inline(line.trim()));
      i += 1;
    }

    closeAll();
    return out.join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* 4. 提示与播报                                                        */
  /* ------------------------------------------------------------------ */
  function toast(message, kind) {
    const node = el(
      "div",
      `toast${kind === "error" ? " is-error" : ""}`,
      `${icon(kind === "error" ? "i-alert" : "i-sparkles")}<span>${escapeHtml(message)}</span>`
    );
    dom.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add("is-out");
      setTimeout(() => node.remove(), 380);
    }, 3800);
  }

  function announce(text) {
    dom.announcer.textContent = "";
    setTimeout(() => (dom.announcer.textContent = text), 60);
  }

  /* ------------------------------------------------------------------ */
  /* 5. 视图切换                                                          */
  /* ------------------------------------------------------------------ */
  function showWelcome() {
    document.body.classList.remove("thread-open");
    dom.welcome.hidden = false;
    dom.thread.hidden = true;
    dom.messageCount = 0;
    dom.messages.innerHTML = "";
    dom.stageScroll.scrollTop = 0;
  }

  function showThread() {
    document.body.classList.add("thread-open");
    if (!dom.welcome.hidden) {
      dom.welcome.hidden = true;
      dom.thread.hidden = false;
    }
  }

  function updateThreadCount() {
    dom.threadCount.textContent = dom.messageCount ? `${dom.messageCount} 条消息` : "";
  }

  function setTitle(text) {
    const value = (text || "新的旅程").trim() || "新的旅程";
    dom.sessionTitle.textContent = value;
    dom.sessionTitle.title = value;
  }

  function nearBottom() {
    const box = dom.stageScroll;
    return box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  }

  function scrollToBottom(force) {
    if (!force && !nearBottom()) return;
    requestAnimationFrame(() => {
      dom.stageScroll.scrollTop = dom.stageScroll.scrollHeight;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 6. 服务状态                                                          */
  /* ------------------------------------------------------------------ */
  let statusPulseTimer = 0;

  function setService(name, status, label) {
    const row = $(`.status__row[data-svc="${name}"]`);
    if (!row) return;
    const changed = row.dataset.state !== status;
    row.dataset.state = status;
    const text = label || (SVC_LABELS[name] && SVC_LABELS[name][status]) || status;
    row.querySelector(".status__state").textContent = text;
    row.title = `${row.querySelector(".status__name").textContent}：${text}`;
    updateStatusTag();

    /* 真实状态变化时给一次确认反馈，常态不闪烁 */
    if (changed && status !== "checking") {
      row.classList.remove("is-changed");
      void row.offsetWidth;
      row.classList.add("is-changed");
      window.clearTimeout(statusPulseTimer);
      statusPulseTimer = window.setTimeout(() => {
        $$(".status__row.is-changed").forEach((r) => r.classList.remove("is-changed"));
      }, 700);
    }
  }

  function updateStatusTag() {
    const rows = $$(".status__row");
    const states = rows.map((r) => r.dataset.state);
    let label = "检测中";
    if (states.includes("error")) label = "部分异常";
    else if (states.includes("checking")) label = "检测中";
    else if (states.filter((s) => s === "ok").length >= 3) label = "运行正常";
    else if (states.includes("ok")) label = "核心在线";
    dom.statusTag.textContent = label;
    dom.statusTag.classList.toggle("is-live", label === "运行正常" || label === "核心在线");
  }

  async function checkHealth() {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      const ms = Math.round(performance.now() - started);
      setService("api", "ok", `在线 · ${ms}ms`);
      dom.apiChip.dataset.state = "ok";
      dom.apiChipText.textContent = "系统就绪";
    } catch (err) {
      setService("api", "error", "离线");
      dom.apiChip.dataset.state = "offline";
      dom.apiChipText.textContent = "服务离线";
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 7. 会话                                                             */
  /* ------------------------------------------------------------------ */
  function renderSessions() {
    const keepScroll = dom.sessionList.scrollTop;
    const firstPaint = !state.sessionsPainted;
    state.sessionsPainted = true;

    dom.sessionList.innerHTML = "";
    const list = state.sessions;
    dom.historyCount.textContent = String(list.length);

    if (!list.length) {
      dom.sessionList.innerHTML = `
        <div class="session-empty">
          ${icon("i-crystal")}
          <span>还没有旅程记录<br>开始第一次对话吧</span>
        </div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((session, index) => {
      const item = el("button", `session-item${session.id === state.sessionId ? " is-active" : ""}`);
      item.type = "button";
      item.setAttribute("role", "listitem");
      /* 只在首次渲染时错峰入场，之后更新不重复播放，避免整列反复闪动 */
      if (firstPaint) item.style.animationDelay = `${Math.min(index * 0.035, 0.4)}s`;
      else item.style.animation = "none";
      item.title = session.title;
      item.innerHTML = `
        <span class="session-item__title">${escapeHtml(session.title || "未命名旅程")}</span>
        <span class="session-item__meta">${escapeHtml(session.updated_at || "")}<i></i>${session.message_count || 0} 条</span>`;
      item.addEventListener("click", () => {
        closeDrawers();
        openSession(session.id);
      });
      fragment.appendChild(item);
    });
    dom.sessionList.appendChild(fragment);
    dom.sessionList.scrollTop = keepScroll;
  }

  async function loadSessions(showLoading) {
    if (showLoading) {
      dom.refreshSessions.classList.add("is-loading");
      dom.refreshSessions.setAttribute("aria-busy", "true");
    }
    const startedAt = performance.now();
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.sessions = data.sessions || [];
      renderSessions();
    } catch (err) {
      dom.sessionList.innerHTML = `
        <div class="session-empty">
          ${icon("i-alert")}
          <span>无法读取会话列表<br>请确认后端服务已启动</span>
        </div>`;
    } finally {
      if (showLoading) {
        /* 至少转满 420ms，保证刷新反馈可被感知 */
        const wait = Math.max(0, 420 - (performance.now() - startedAt));
        window.setTimeout(() => {
          dom.refreshSessions.classList.remove("is-loading");
          dom.refreshSessions.setAttribute("aria-busy", "false");
        }, wait);
      }
    }
  }

  async function openSession(sessionId) {
    if (state.streaming) {
      toast("向导正在回答，请稍候再切换旅程");
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("会话不存在");
      const data = await res.json();

      state.sessionId = sessionId;
      sessionStorage.setItem(STORE_KEY, sessionId);
      setTitle(data.session && data.session.title);

      dom.messages.innerHTML = "";
      dom.messageCount = 0;
      const list = data.messages || [];
      if (!list.length) {
        showWelcome();
      } else {
        showThread();
        for (const message of list) {
          if (message.role === "user") {
            appendUserMessage(message.content, message.time);
          } else {
            const ui = appendAssistantMessage();
            ui.bubble.innerHTML = renderMarkdown(message.content || "");
            ui.bubble.querySelector(".typing")?.remove();
            ui.metaTime.textContent = stamp(message.time);
          }
        }
        dom.messageCount = list.length;
        updateThreadCount();
        scrollToBottom(true);
      }
      renderSessions();
    } catch (err) {
      toast("读取旅程记录失败", "error");
      newSession();
    }
  }

  function newSession() {
    if (state.streaming) {
      stopStream();
    }
    state.sessionId = null;
    sessionStorage.removeItem(STORE_KEY);
    setTitle("新的旅程");
    showWelcome();
    renderSessions();
    dom.input.focus();
    resizeInput();
  }

  /* ------------------------------------------------------------------ */
  /* 8. 消息渲染                                                          */
  /* ------------------------------------------------------------------ */
  function appendUserMessage(text, time) {
    showThread();
    const article = el("article", "msg msg--user");
    const bubble = el("div", "bubble");
    bubble.textContent = text;
    const meta = el("div", "msg__time", escapeHtml(stamp(time)));
    article.append(bubble, meta);
    dom.messages.appendChild(article);
    dom.messageCount += 1;
    updateThreadCount();
    scrollToBottom(true);
    return article;
  }

  function appendAssistantMessage() {
    showThread();
    const article = el("article", "msg msg--assistant");
    article.innerHTML = `
      <div class="msg__avatar">${icon("i-crystal")}</div>
      <div class="msg__body">
        <div class="msg__meta">
          <span class="msg__name">SmartVoyage</span>
          <span class="msg__role">AI 旅行规划师</span>
          <span class="msg__time">${timeNow()}</span>
        </div>
        <div class="tools" hidden>
          <div class="tools__head">
            ${icon("i-sparkles")}
            <span class="tools__label">工具调用</span>
            <span class="tools__count">0</span>
          </div>
          <ol class="tools__list"></ol>
        </div>
        <div class="bubble bubble--ai markdown">
          <span class="typing"><i></i><i></i><i></i> 正在为你规划…</span>
        </div>
        <div class="msg__actions" hidden>
          <button type="button" data-action="copy">${icon("i-copy")} 复制</button>
        </div>
      </div>`;

    const ui = {
      article,
      block: $(".tools", article),
      toolsList: $(".tools__list", article),
      toolsCount: $(".tools__count", article),
      bubble: $(".bubble", article),
      actions: $(".msg__actions", article),
      metaTime: $(".msg__time", article),
      runningTool: null,
      toolMap: new Map(),
    };

    $('[data-action="copy"]', article).addEventListener("click", () => {
      copyText(ui.raw || "");
      toast("回复已复制");
    });

    dom.messages.appendChild(article);
    dom.messageCount += 1;
    updateThreadCount();
    scrollToBottom(true);
    return ui;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const area = el("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  function setStreamCaret(bubble) {
    bubble.querySelector(".stream-caret")?.remove();
    const caret = el("span", "stream-caret");
    const last = bubble.lastElementChild;
    if (last && /^(P|LI|H[1-6]|TD|BLOCKQUOTE)$/.test(last.tagName)) {
      last.appendChild(caret);
    } else {
      bubble.appendChild(caret);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 9. 工具调用时间线                                                    */
  /* ------------------------------------------------------------------ */
  function argChips(args) {
    if (!args || typeof args !== "object") return "";
    return Object.entries(args)
      .map(([key, value]) => {
        const label = ARG_LABELS[key] || key;
        const val =
          value == null
            ? "—"
            : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
        return `<span class="arg"><i>${escapeHtml(label)}</i>${escapeHtml(val.slice(0, 42))}</span>`;
      })
      .join("");
  }

  const STATE_TEXT = { pending: "等待执行", running: "执行中", ok: "执行成功", failed: "执行失败" };

  function setToolState(node, status) {
    node.classList.remove("is-pending", "is-running", "is-ok", "is-failed", "is-open");
    node.classList.add(`is-${status}`);
    node.dataset.status = status;
    const stateEl = node.querySelector(".tool__state");
    if (stateEl) stateEl.textContent = STATE_TEXT[status] || status;
  }

  function addToolCall(ui, event) {
    const name = event.name || "unknown";
    const meta = TOOLS[name] || { zh: name, icon: "i-sparkles", svc: null };

    ui.block.hidden = false;
    const node = el("li", "tool");
    node.dataset.tool = name;
    node.dataset.status = "pending";
    node.innerHTML = `
      <span class="tool__node"></span>
      <div class="tool__card">
        <button type="button" class="tool__head">
          <span class="tool__icon">${icon(meta.icon)}</span>
          <span class="tool__names">
            <b>${escapeHtml(meta.zh)}</b>
            <em>${escapeHtml(name)}</em>
          </span>
          <span class="tool__state">等待执行</span>
          <span class="tool__toggle">${icon("i-chevron")}</span>
        </button>
        <div class="tool__args">${argChips(event.args)}</div>
        <div class="tool__detail" hidden></div>
      </div>`;

    const head = $(".tool__head", node);
    head.addEventListener("click", () => {
      const detail = $(".tool__detail", node);
      if (detail.hidden && !detail.childElementCount) return;
      node.classList.toggle("is-open");
    });

    /* 串行执行：已有运行中的工具时，新调用先进入「等待执行」 */
    if (ui.runningTool && ui.runningTool.dataset.status === "running") {
      setToolState(node, "pending");
    } else {
      setToolState(node, "running");
      ui.runningTool = node;
    }

    if (!ui.toolMap.has(name)) ui.toolMap.set(name, []);
    ui.toolMap.get(name).push(node);

    ui.toolsList.appendChild(node);
    ui.toolsCount.textContent = String(ui.toolsList.childElementCount);
    if (meta.svc) setService(meta.svc, "checking", "调用中");
    scrollToBottom();
    return node;
  }

  function summarizeResult(text) {
    const raw = String(text == null ? "" : text);
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      data = null;
    }
    if (!data || typeof data !== "object") {
      return { summary: raw.trim().slice(0, 120) || "（空返回）", preview: "", raw: raw.slice(0, 4000) };
    }
    if (data.error) {
      return {
        summary: String(data.error),
        error: true,
        preview: "",
        raw: raw.slice(0, 4000),
      };
    }
    if (data.condition && data.city) {
      const range =
        data.temp_min != null && data.temp_max != null
          ? `${data.temp_min}~${data.temp_max}℃`
          : "";
      return {
        summary: `<b>${escapeHtml(data.city)}</b> · ${escapeHtml(data.condition)}${
          range ? " · " + escapeHtml(range) : ""
        }`,
        preview: "",
        raw: raw.slice(0, 4000),
      };
    }
    if (Array.isArray(data.items)) {
      const count = data.count != null ? data.count : data.items.length;
      const rows = data.items.slice(0, 3).map((item) => {
        const pairs = Object.entries(item)
          .filter(([k]) => FIELD_LABELS[k])
          .slice(0, 4)
          .map(([k, v]) => `${FIELD_LABELS[k]} ${String(v).slice(0, 22)}`);
        return `<span><b>${escapeHtml(pairs[0] || "记录")}</b>${
          pairs.length > 1 ? " · " + escapeHtml(pairs.slice(1).join(" · ")) : ""
        }</span>`;
      });
      return {
        summary: `返回 <b>${count}</b> 条结果`,
        preview: rows.join(""),
        raw: raw.slice(0, 4000),
      };
    }
    const pairs = Object.entries(data)
      .filter(([k, v]) => typeof v !== "object" && FIELD_LABELS[k])
      .slice(0, 4)
      .map(([k, v]) => `${FIELD_LABELS[k]} ${String(v).slice(0, 20)}`);
    return {
      summary: pairs.length ? escapeHtml(pairs.join(" · ")) : "调用完成",
      preview: "",
      raw: raw.slice(0, 4000),
    };
  }

  function addToolResult(ui, event) {
    const name = event.name || "unknown";
    const bucket = ui.toolMap.get(name) || [];
    let node =
      bucket.find((n) => n.dataset.status === "running") ||
      bucket.find((n) => n.dataset.status === "pending") ||
      bucket[bucket.length - 1];

    if (!node) {
      node = addToolCall(ui, event);
    }

    const ok = event.ok !== false;
    setToolState(node, ok ? "ok" : "failed");

    const info = summarizeResult(event.text);
    const detail = $(".tool__detail", node);
    detail.hidden = false;
    detail.innerHTML = `
      <div class="tool__summary">
        ${icon(ok ? "i-check" : "i-alert")}
        <span class="${ok ? "" : "is-err"}">${ok ? info.summary : escapeHtml(info.summary)}</span>
      </div>
      ${info.preview ? `<div class="tool__preview">${info.preview}</div>` : ""}
      ${info.raw ? `<pre class="tool__raw">${escapeHtml(info.raw)}</pre>` : ""}`;

    const meta = TOOLS[name];
    if (meta && meta.svc) setService(meta.svc, ok ? "ok" : "error", ok ? "已验证" : "异常");
    setService("agent", "ok", "在线");

    if (ui.runningTool === node) ui.runningTool = null;
    /* 把下一个等待中的调用提升为执行中 */
    const next = $$(".tool", ui.toolsList).find((n) => n.dataset.status === "pending");
    if (next) {
      setToolState(next, "running");
      ui.runningTool = next;
    }

    /* 天气工具结果 → 右侧天气卡 */
    if (name === "get_weather" && ok) applyWeather(event.text);
    scrollToBottom();
  }

  /* ------------------------------------------------------------------ */
  /* 10. 天气卡                                                          */
  /* ------------------------------------------------------------------ */
  function weatherKind(condition) {
    const text = String(condition || "");
    if (/雪|冰|冻|霰/.test(text)) return "snow";
    if (/雨|雷|阵雨/.test(text)) return "rain";
    if (/雾|霾|沙|尘|浮尘/.test(text)) return "fog";
    if (/晴/.test(text)) return "sun";
    return "cloud";
  }

  function weatherGlyph(kind) {
    const common = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
    if (kind === "sun") {
      return `<svg viewBox="0 0 48 48" ${common}>
        <circle cx="24" cy="24" r="8.5"/>
        <path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M36.7 11.3l-3.5 3.5M14.8 33.2l-3.5 3.5"/>
      </svg>`;
    }
    if (kind === "rain") {
      return `<svg viewBox="0 0 48 48" ${common}>
        <path d="M14 30a7 7 0 0 1-.6-13.97A10 10 0 0 1 33 17.5a6.5 6.5 0 0 1 1.5 12.5"/>
        <path d="M17 35l-2 6M25 35l-2 6M33 35l-2 6"/>
      </svg>`;
    }
    if (kind === "snow") {
      return `<svg viewBox="0 0 48 48" ${common}>
        <path d="M24 7v34M9.3 15.5l29.4 17M38.7 15.5l-29.4 17"/>
        <path d="M24 13l-4-4M24 13l4-4M24 35l-4 4M24 35l4 4M12 21l-5-1M12 21l1-5M36 27l5 1M36 27l-1 5M36 21l5-1M36 21l0-5M12 27l-5 1M12 27l1 5"/>
      </svg>`;
    }
    if (kind === "fog") {
      return `<svg viewBox="0 0 48 48" ${common}>
        <path d="M14 26a7 7 0 0 1-.6-13.97A10 10 0 0 1 33 13.5a6.5 6.5 0 0 1 1.5 12.5"/>
        <path d="M8 33h32M12 39h24"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 48 48" ${common}>
      <path d="M14 32a7.5 7.5 0 0 1-.6-14.96A10.5 10.5 0 0 1 33.5 19a7 7 0 0 1 .5 13z"/>
      <path d="M18 26h12"/>
    </svg>`;
  }

  function applyWeather(text) {
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return;
    }
    if (!data || data.error || !data.city || !data.condition) return;

    state.weather = data;
    const kind = weatherKind(data.condition);

    dom.wx.dataset.cond = kind;
    dom.wxCity.textContent = data.city;
    dom.wxRegion.textContent = data.province || "";
    dom.wxCond.textContent = data.condition;
    dom.wxDate.textContent = prettyDate(data.date);

    const max = data.temp_max != null ? `${data.temp_max}°` : "—";
    const min = data.temp_min != null ? `${data.temp_min}°` : "—";
    dom.wxRange.innerHTML = `<b>${escapeHtml(max)}</b><i>/</i>${escapeHtml(min)}`;

    const now = data.now && typeof data.now === "object" ? data.now : null;
    dom.wxNow.textContent = now && now.temp != null ? `${now.temp}°` : "—";
    dom.wxFeels.textContent = now && now.feels_like != null ? `${now.feels_like}°` : "—";
    dom.wxHumidity.textContent = data.humidity != null ? `${data.humidity}%` : "—";
    dom.wxWindDir.textContent = data.wind_dir || "—";
    dom.wxWind.textContent = data.wind_scale ? `${data.wind_scale} 级` : "—";
    dom.wxPrecip.textContent = data.precip_mm != null ? `${data.precip_mm} mm` : "—";
    dom.wxGlyph.innerHTML = weatherGlyph(kind);
    dom.wxSource.innerHTML =
      `<span>数据来源：${escapeHtml(data.source || "和风天气")}</span>` +
      `<span>${escapeHtml(timeNow())} 更新</span>`;
    dom.wxSource.title = now ? "实况数据仅当天提供" : "该日期无实况数据，仅展示预报";

    dom.wxEmpty.hidden = true;
    dom.wx.hidden = false;
    dom.wxTag.textContent = "实时 · 和风";
    dom.wxTag.classList.add("is-live");
  }

  /* ------------------------------------------------------------------ */
  /* 11. SSE 流式对话                                                     */
  /* ------------------------------------------------------------------ */
  function setStreaming(value) {
    state.streaming = value;
    dom.composer.classList.toggle("is-streaming", value);
    dom.composerState.classList.toggle("is-busy", value);
    dom.composerState.textContent = value ? "向导正在规划旅程…" : "冰雪向导待命中";
    $("#send").setAttribute("aria-label", value ? "停止生成" : "发送消息");
  }

  function stopStream() {
    if (state.abort) state.abort.abort();
  }

  function parseSSE(onEvent) {
    let buffer = "";
    const emit = (block) => {
      const lines = block.split(/\r?\n/);
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith(":")) continue;
        const match = line.match(/^data:\s?(.*)$/);
        if (match) dataLines.push(match[1]);
      }
      if (!dataLines.length) return;
      const payload = dataLines.join("\n").trim();
      if (!payload) return;
      if (payload === "[DONE]") {
        onEvent({ type: "done" });
        return;
      }
      try {
        onEvent(JSON.parse(payload));
      } catch (err) {
        /* 忽略无法解析的片段 */
      }
    };

    return {
      push(chunk) {
        buffer += chunk;
        let match;
        while ((match = /\r?\n\r?\n/.exec(buffer)) !== null) {
          const block = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          emit(block);
        }
      },
      flush() {
        if (buffer.trim()) emit(buffer);
        buffer = "";
      },
    };
  }

  function friendlyError(err) {
    const raw = (err && err.message) || "";
    if (/Failed to fetch|NetworkError|load failed|network/i.test(raw)) {
      return "无法连接到后端服务，请确认 FastAPI 服务已启动";
    }
    if (/HTTP 5\d\d/.test(raw)) return "服务端返回异常，请稍后重试";
    if (/HTTP 4\d\d/.test(raw)) return "请求被拒绝，请检查输入内容";
    if (/abort/i.test(raw)) return "请求已中断";
    return raw || "网络连接中断";
  }

  async function streamChat(text) {
    if (state.streaming) return;
    if (!state.sessionId) state.sessionId = uid();

    const userNode = appendUserMessage(text);
    void userNode;
    const ui = appendAssistantMessage();

    let raw = "";
    let dirty = false;
    let finished = false;
    let lastPaint = 0;
    let paintTimer = 0;

    const paint = () => {
      if (finished || !dirty) return;
      dirty = false;
      lastPaint = performance.now();
      ui.bubble.innerHTML = raw.trim() ? renderMarkdown(raw) : "";
      setStreamCaret(ui.bubble);
    };

    const schedulePaint = () => {
      dirty = true;
      if (paintTimer || finished) return;
      const wait = Math.max(0, 55 - (performance.now() - lastPaint));
      paintTimer = setTimeout(() => {
        paintTimer = 0;
        paint();
      }, wait);
    };

    const markDone = () => {
      if (finished) return;
      finished = true;
      if (paintTimer) {
        clearTimeout(paintTimer);
        paintTimer = 0;
      }
      ui.bubble.innerHTML = raw.trim() ? renderMarkdown(raw) : "";
      ui.actions.hidden = !raw.trim();
      ui.raw = raw;
    };

    const handle = (event) => {
      switch (event.type) {
        case "session":
          state.sessionId = event.id;
          sessionStorage.setItem(STORE_KEY, event.id);
          if (event.title) setTitle(event.title);
          setService("agent", "ok", "在线");
          break;

        case "tool_call":
          setService("agent", "checking", "请求中");
          addToolCall(ui, event);
          break;

        case "tool_result":
          addToolResult(ui, event);
          break;

        case "token":
          if (typeof event.text === "string") {
            raw += event.text;
            dirty = true;
            schedulePaint();
            scrollToBottom();
          }
          break;

        case "message":
          if (typeof event.text === "string") {
            raw = event.text;
            dirty = true;
            schedulePaint();
            scrollToBottom();
          }
          break;

        case "error":
          appendErrorBubble(ui, event.text || "未知错误");
          break;

        case "done":
          markDone();
          break;

        default:
          break;
      }
    };

    setStreaming(true);
    state.abort = new AbortController();
    const parser = parseSSE(handle);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.sessionId, message: text }),
        signal: state.abort.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`请求失败（HTTP ${res.status}）`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.flush();
      markDone();
    } catch (err) {
      markDone();
      if (err && err.name === "AbortError") {
        if (!raw.trim()) {
          ui.bubble.innerHTML = `<span class="typing">已停止生成</span>`;
        } else {
          ui.bubble.insertAdjacentHTML("beforeend", `<p class="msg__note">— 已停止生成 —</p>`);
        }
      } else {
        const message = friendlyError(err);
        appendErrorBubble(ui, message, () => {
          if (state.streaming) return;
          userNode.remove();
          ui.article.remove();
          dom.messageCount = Math.max(0, dom.messageCount - 2);
          updateThreadCount();
          streamChat(text);
        });
        setService("agent", "error", "异常");
        toast(`对话中断：${message}`, "error");
      }
    } finally {
      markDone();
      if (!ui.error) setService("agent", "ok", "在线");
      if (!raw.trim() && !ui.error) {
        ui.bubble.innerHTML = `<span class="typing">（没有收到回复内容，请重试）</span>`;
      }
      setStreaming(false);
      state.abort = null;
      loadSessions();
      announce("回复完成");
    }
  }

  function appendErrorBubble(ui, message, onRetry) {
    if (ui.error) return;
    const node = el("div", "bubble bubble--error");
    node.innerHTML =
      `${icon("i-alert")}<span>${escapeHtml(message)}</span>` +
      (onRetry ? `<button type="button" class="retry-btn">${icon("i-refresh")}重试</button>` : "");
    if (onRetry) {
      node.querySelector(".retry-btn").addEventListener("click", onRetry);
    }
    ui.bubble.after(node);
    if (!ui.bubble.textContent.trim()) ui.bubble.style.display = "none";
    ui.error = node;
    scrollToBottom();
  }

  /* ------------------------------------------------------------------ */
  /* 12. 输入区                                                          */
  /* ------------------------------------------------------------------ */
  function resizeInput() {
    const input = dom.input;
    input.style.height = "auto";
    const next = Math.min(input.scrollHeight, 148);
    input.style.height = `${Math.max(next, 28)}px`;
  }

  function setDraft(text) {
    dom.input.value = text;
    resizeInput();
    dom.input.focus();
    const len = text.length;
    dom.input.setSelectionRange(len, len);
    dom.composer.animate(
      [{ boxShadow: "0 0 0 3px rgba(143,203,255,0.28)" }, { boxShadow: "0 0 0 3px rgba(143,203,255,0)" }],
      { duration: 900, easing: "ease-out" }
    );
  }

  function handleSubmit() {
    if (state.streaming) return;
    const text = dom.input.value.trim();
    if (!text) {
      dom.input.focus();
      return;
    }
    dom.input.value = "";
    resizeInput();
    streamChat(text);
  }

  /* ------------------------------------------------------------------ */
  /* 13. 灵感内容                                                        */
  /* ------------------------------------------------------------------ */
  const INSPIRATIONS = [
    { kicker: "今日灵感 · 花海", title: "蓝花海里的第一场雪", text: "在高原湖泊与花海之间醒来，是旅行者最浪漫的冬日记忆。清晨的薄雾散去时，整片山谷会变成淡蓝色。" },
    { kicker: "今日灵感 · 极光", title: "在冰岛等一场绿色的极光", text: "把车停在远离灯火的旷野，给自己留三个夜晚。极光出现的时刻，安静得能听见雪落下的声音。" },
    { kicker: "今日灵感 · 古都", title: "京都的冬天适合慢慢走", text: "避开人潮，沿鸭川从北往南走一次。傍晚的寺院与街角的小店，比任何攻略都值得停留。" },
    { kicker: "今日灵感 · 冰城", title: "哈尔滨的冰与灯", text: "零下二十度的空气里，冰雕会在灯光下变成透明的水晶。带一副手套，再带一块备用电池。" },
    { kicker: "今日灵感 · 雪山", title: "去雪山脚下住一晚", text: "选择海拔更低的村落落脚，把清晨留给第一班缆车。云海翻涌时，记得给相机留电。" },
    { kicker: "今日灵感 · 海岛", title: "把冬天交给南方的海", text: "初冬的海风依然温柔。挑一间带露台的民宿，用一个下午看潮水退去，晚上去码头吃一顿刚上岸的海鲜。" },
  ];

  function renderInspiration() {
    const dayIndex = Math.floor(Date.now() / 86400000) % INSPIRATIONS.length;
    const item = INSPIRATIONS[dayIndex];
    dom.inspireKicker.textContent = item.kicker;
    dom.inspireTitle.textContent = item.title;
    dom.inspireText.textContent = item.text;
  }

  /* ------------------------------------------------------------------ */
  /* 14. 抽屉 / 顶栏时钟                                                  */
  /* ------------------------------------------------------------------ */
  let drawerTrigger = null;

  function focusables(panel) {
    return Array.from(
      panel.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((node) => node.offsetParent !== null);
  }

  function trapTab(event) {
    if (event.key !== "Tab") return;
    const panel = dom.rail.classList.contains("is-open")
      ? dom.rail
      : dom.insight.classList.contains("is-open")
      ? dom.insight
      : null;
    if (!panel) return;
    const items = focusables(panel);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openDrawer(target, trigger) {
    closeDrawers(false);
    drawerTrigger = trigger || null;
    target.classList.add("is-open");
    dom.scrim.classList.add("is-on");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", trapTab);
    const items = focusables(target);
    if (items.length) items[0].focus();
  }

  function closeDrawers(restoreFocus = true) {
    const wasOpen = dom.rail.classList.contains("is-open") || dom.insight.classList.contains("is-open");
    dom.rail.classList.remove("is-open");
    dom.insight.classList.remove("is-open");
    dom.scrim.classList.remove("is-on");
    dom.railToggle.setAttribute("aria-expanded", "false");
    dom.insightToggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", trapTab);
    if (wasOpen && restoreFocus && drawerTrigger && drawerTrigger.offsetParent !== null) {
      drawerTrigger.focus();
    }
    drawerTrigger = null;
  }

  function tickClock() {
    const d = new Date();
    dom.clockLabel.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    dom.todayLabel.textContent = `${d.getMonth() + 1}月${pad2(d.getDate())}日 · 周${WEEK[d.getDay()]}`;
  }

  /* ------------------------------------------------------------------ */
  /* 15. 事件绑定                                                        */
  /* ------------------------------------------------------------------ */
  function bindEvents() {
    dom.composer.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSubmit();
    });

    dom.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        handleSubmit();
      }
    });

    dom.input.addEventListener("input", resizeInput);

    dom.send.addEventListener("click", (event) => {
      event.preventDefault();
      if (state.streaming) {
        stopStream();
      } else {
        handleSubmit();
      }
    });

    dom.newChat.addEventListener("click", () => {
      closeDrawers();
      newSession();
    });

    dom.refreshSessions.addEventListener("click", () => {
      if (dom.refreshSessions.classList.contains("is-loading")) return;
      loadSessions(true);
      toast("已刷新旅程记录");
    });

    /* 快捷卡片、导航项、灵感标签：统一 data-prompt 行为 */
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-prompt]");
      if (!trigger) return;
      event.preventDefault();
      closeDrawers();
      if (trigger.classList.contains("quick") || trigger.classList.contains("ghost-btn")) {
        if (state.streaming) {
          toast("向导正在回答，请稍候");
          return;
        }
        const text = trigger.dataset.prompt;
        dom.input.value = "";
        resizeInput();
        streamChat(text);
      } else {
        setDraft(trigger.dataset.prompt);
      }
    });

    dom.railToggle.addEventListener("click", () => openDrawer(dom.rail, dom.railToggle));
    dom.insightToggle.addEventListener("click", () => openDrawer(dom.insight, dom.insightToggle));
    dom.scrim.addEventListener("click", () => closeDrawers());

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawers();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) closeDrawers();
    });

    /* 卡片鼠标光晕 */
    document.addEventListener(
      "pointermove",
      (event) => {
        const card = event.target.closest(".quick");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
        card.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
      },
      { passive: true }
    );
  }

  /* ------------------------------------------------------------------ */
  /* 16. 视觉：视差 / 光晕 / 粒子                                         */
  /* ------------------------------------------------------------------ */
  function initFX() {
    const canvas = $("#fx");
    if (!canvas || !canvas.getContext) return;
    const front = $("#fxFront");
    const fctx = front && front.getContext ? front.getContext("2d") : null;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, seen: false };
    const scene = { x: 0, y: 0 };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let time = 0;

    const far = [];
    const near = [];
    const petals = [];
    const sparks = [];
    const bokeh = [];
    const orbs = [];
    const glints = [];
    const sprites = {};

    const rand = (min, max) => min + Math.random() * (max - min);

    /* 预渲染光斑，避免每帧创建渐变 */
    function makeGlowSprite() {
      const size = 96;
      const pad = document.createElement("canvas");
      pad.width = size;
      pad.height = size;
      const pctx = pad.getContext("2d");
      const grad = pctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, "rgba(214,240,255,0.85)");
      grad.addColorStop(0.35, "rgba(160,210,255,0.35)");
      grad.addColorStop(1, "rgba(120,180,255,0)");
      pctx.fillStyle = grad;
      pctx.fillRect(0, 0, size, size);
      return pad;
    }

    function spawnFar(initial) {
      return {
        x: rand(0, width),
        y: initial ? rand(0, height) : rand(-40, -6),
        r: rand(0.7, 1.9),
        vy: rand(0.18, 0.52),
        amp: rand(4, 18),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.0025, 0.0065),
        alpha: rand(0.12, 0.32),
      };
    }

    function spawnNear(initial) {
      return {
        x: rand(0, width),
        y: initial ? rand(0, height) : rand(-60, -10),
        r: rand(2.2, 5.2),
        vy: rand(0.55, 1.25),
        amp: rand(10, 30),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.003, 0.008),
        rot: rand(0, Math.PI * 2),
        spin: rand(-0.004, 0.004),
        alpha: rand(0.24, 0.52),
      };
    }

    function spawnPetal(initial) {
      return {
        x: rand(0, width),
        y: initial ? rand(0, height) : rand(-80, -20),
        r: rand(4, 8.5),
        vy: rand(0.35, 0.85),
        amp: rand(26, 66),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.0035, 0.0075),
        rot: rand(0, Math.PI * 2),
        spin: rand(-0.012, 0.012),
        alpha: rand(0.14, 0.36),
        hue: Math.random() < 0.55 ? "143,203,255" : "178,200,255",
      };
    }

    function spawnSpark(initial) {
      return {
        x: rand(0, width),
        y: rand(0, height),
        r: rand(0.5, 1.5),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.004, 0.014),
        drift: rand(-0.08, 0.08),
        alpha: rand(0.14, 0.44),
      };
    }

    function spawnBokeh() {
      return {
        x: rand(0, width),
        y: rand(0, height),
        r: rand(26, 66),
        vy: rand(-0.12, -0.04),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.0012, 0.003),
        alpha: rand(0.025, 0.06),
      };
    }

    /* 前景柔光球：浮在 UI 之上，提供可感知的空间纵深 */
    function spawnOrb(initial) {
      return {
        x: rand(-40, width + 40),
        y: initial ? rand(0, height) : height + rand(30, 90),
        r: rand(34, 78),
        vy: rand(-0.22, -0.08),
        amp: rand(16, 46),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.0015, 0.004),
        alpha: rand(0.10, 0.22),
      };
    }

    /* 前景冰晶星芒 */
    function spawnGlint(initial) {
      return {
        x: rand(0, width),
        y: initial ? rand(0, height) : rand(-30, -6),
        vy: rand(0.08, 0.26),
        size: rand(1.8, 3.6),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.004, 0.009),
        drift: rand(-0.12, 0.12),
        alpha: rand(0.28, 0.55),
      };
    }

    function build() {
      far.length = near.length = petals.length = sparks.length = bokeh.length = 0;
      orbs.length = glints.length = 0;
      const area = Math.min(1, (width * height) / (1600 * 900));
      const small = width < 760;
      const farCount = Math.round((small ? 16 : 26) * Math.max(area, small ? 1 : 0.6));
      const nearCount = small ? 4 : 8;
      const petalCount = small ? 3 : 5;
      const sparkCount = small ? 8 : 12;
      const orbCount = small ? 5 : 9;
      const glintCount = small ? 5 : 8;

      for (let i = 0; i < farCount; i += 1) far.push(spawnFar(true));
      for (let i = 0; i < nearCount; i += 1) near.push(spawnNear(true));
      for (let i = 0; i < petalCount; i += 1) petals.push(spawnPetal(true));
      for (let i = 0; i < sparkCount; i += 1) sparks.push(spawnSpark(true));
      for (let i = 0; i < 3; i += 1) bokeh.push(spawnBokeh());
      for (let i = 0; i < orbCount; i += 1) orbs.push(spawnOrb(true));
      for (let i = 0; i < glintCount; i += 1) glints.push(spawnGlint(true));
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (front && fctx) {
        front.width = Math.round(width * dpr);
        front.height = Math.round(height * dpr);
        front.style.width = `${width}px`;
        front.style.height = `${height}px`;
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      build();
      if (reduce) drawStatic();
    }

    function drawCrystal(r) {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3;
        const ex = Math.cos(a) * r;
        const ey = Math.sin(a) * r;
        ctx.moveTo(0, 0);
        ctx.lineTo(ex, ey);
        const bx = Math.cos(a) * r * 0.62;
        const by = Math.sin(a) * r * 0.62;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + 0.85) * r * 0.34, by + Math.sin(a + 0.85) * r * 0.34);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a - 0.85) * r * 0.34, by + Math.sin(a - 0.85) * r * 0.34);
      }
      ctx.stroke();
    }

    function drawPetal(r) {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.85, -r * 0.5, r * 0.7, r * 0.65, 0, r);
      ctx.bezierCurveTo(-r * 0.7, r * 0.65, -r * 0.85, -r * 0.5, 0, -r);
      ctx.closePath();
      ctx.fill();
    }

    function drawStatic() {
      ctx.clearRect(0, 0, width, height);
      for (const p of far) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#DCEFFF";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of near) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = "#EAF7FF";
        ctx.lineWidth = 1;
        drawCrystal(p.r);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function update(dt) {
      const k = Math.min(dt / 16.667, 2.4);
      time += dt;
      const wind = Math.sin(time * 0.00016) * 0.55 + Math.sin(time * 0.00007) * 0.35;

      /* 视差 */
      const targetX = pointer.tx * 9;
      const targetY = pointer.ty * 6;
      scene.x += (targetX - scene.x) * 0.045;
      scene.y += (targetY - scene.y) * 0.045;
      if (dom.scenePhoto) {
        dom.scenePhoto.style.transform = `translate3d(${scene.x.toFixed(2)}px, ${scene.y.toFixed(2)}px, 0) scale(1.055)`;
      }

      /* 鼠标光晕 */
      pointer.x += (pointer.tx * width - pointer.x) * 0.09;
      pointer.y += (pointer.ty * height - pointer.y) * 0.09;
      if (dom.pointerGlow && pointer.seen) {
        dom.pointerGlow.style.transform = `translate3d(${pointer.x.toFixed(1)}px, ${pointer.y.toFixed(1)}px, 0)`;
      }

      ctx.clearRect(0, 0, width, height);

      /* 远景雪花 */
      ctx.fillStyle = "#DCEFFF";
      for (const p of far) {
        p.y += p.vy * k;
        p.phase += p.speed * k;
        p.x += (Math.sin(p.phase) * 0.42 + wind * 0.35) * k;
        if (p.y > height + 20) Object.assign(p, spawnFar(false));
        if (p.x < -30) p.x = width + 20;
        if (p.x > width + 30) p.x = -20;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      /* 光斑 */
      for (const p of bokeh) {
        p.y += p.vy * k;
        p.phase += p.speed * k;
        p.x += Math.sin(p.phase) * 0.18 * k;
        if (p.y < -90) Object.assign(p, spawnBokeh(), { y: height + 60 });
        ctx.globalAlpha = p.alpha;
        ctx.drawImage(
          sprites.glow,
          p.x - p.r,
          p.y - p.r,
          p.r * 2,
          p.r * 2
        );
      }

      /* 近景冰晶 */
      ctx.strokeStyle = "#F0FAFF";
      ctx.shadowColor = "rgba(170, 220, 255, 0.9)";
      ctx.shadowBlur = 5;
      for (const p of near) {
        p.y += p.vy * k;
        p.phase += p.speed * k;
        p.rot += p.spin * k;
        p.x += (Math.sin(p.phase) * 0.7 + wind * 0.7) * k;
        if (p.y > height + 30) Object.assign(p, spawnNear(false));
        if (p.x < -40) p.x = width + 30;
        if (p.x > width + 40) p.x = -30;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        ctx.lineWidth = 0.9;
        drawCrystal(p.r);
        ctx.restore();
      }
      ctx.shadowBlur = 0;

      /* 花瓣 */
      for (const p of petals) {
        p.y += p.vy * k;
        p.phase += p.speed * k;
        p.rot += p.spin * k;
        p.x += (Math.sin(p.phase) * 1.4 + wind * 1.1) * k;
        if (p.y > height + 40) Object.assign(p, spawnPetal(false));
        if (p.x < -50) p.x = width + 40;
        if (p.x > width + 50) p.x = -40;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        const grad = ctx.createRadialGradient(0, -p.r * 0.3, 0, 0, 0, p.r * 1.2);
        grad.addColorStop(0, `rgba(${p.hue},0.95)`);
        grad.addColorStop(1, `rgba(${p.hue},0.05)`);
        ctx.fillStyle = grad;
        drawPetal(p.r);
        ctx.restore();
      }

      /* 星光 */
      for (const p of sparks) {
        p.phase += p.speed * k;
        p.x += p.drift * k;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        const twinkle = (Math.sin(p.phase) + 1) / 2;
        const alpha = p.alpha * (0.25 + twinkle * 0.9);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#F4FBFF";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.75 + twinkle * 0.5), 0, Math.PI * 2);
        ctx.fill();
        if (twinkle > 0.86) {
          ctx.strokeStyle = "rgba(220,244,255,0.75)";
          ctx.lineWidth = 0.7;
          const rr = p.r * 3.4;
          ctx.beginPath();
          ctx.moveTo(p.x - rr, p.y);
          ctx.lineTo(p.x + rr, p.y);
          ctx.moveTo(p.x, p.y - rr);
          ctx.lineTo(p.x, p.y + rr);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;

      /* ---- 前景层：浮在 UI 之上的柔光球与星芒 ---- */
      if (!fctx) return;
      fctx.clearRect(0, 0, width, height);

      for (const p of orbs) {
        p.y += p.vy * k;
        p.phase += p.speed * k;
        p.x += Math.sin(p.phase) * 0.25 * k;
        if (p.y < -p.r * 2) Object.assign(p, spawnOrb(false));
        fctx.globalAlpha = p.alpha;
        fctx.drawImage(sprites.glow, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }

      for (const p of glints) {
        p.y += p.vy * k;
        p.x += p.drift * k;
        p.phase += p.speed * k;
        if (p.y > height + 20) Object.assign(p, spawnGlint(false));
        if (p.x < -12) p.x = width + 12;
        if (p.x > width + 12) p.x = -12;

        const tw = (Math.sin(p.phase) + 1) / 2;
        const rr = p.size * (0.8 + tw * 0.7);
        fctx.globalAlpha = p.alpha * (0.35 + tw * 0.65);
        fctx.strokeStyle = "rgba(255,255,255,0.95)";
        fctx.lineWidth = 1;
        fctx.beginPath();
        fctx.moveTo(p.x - rr * 3.2, p.y);
        fctx.lineTo(p.x + rr * 3.2, p.y);
        fctx.moveTo(p.x, p.y - rr * 3.2);
        fctx.lineTo(p.x, p.y + rr * 3.2);
        fctx.stroke();
        fctx.fillStyle = "rgba(255,255,255,0.95)";
        fctx.beginPath();
        fctx.arc(p.x, p.y, rr * 0.45, 0, Math.PI * 2);
        fctx.fill();
      }
      fctx.globalAlpha = 1;
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(now - last || 16, 48);
      last = now;
      update(dt);
    }

    sprites.glow = makeGlowSprite();
    resize();
    window.addEventListener("resize", resize);

    if (reduce) {
      drawStatic();
      return;
    }

    window.addEventListener(
      "pointermove",
      (event) => {
        pointer.tx = (event.clientX / width) * 2 - 1;
        pointer.ty = (event.clientY / height) * 2 - 1;
        if (!pointer.seen) {
          pointer.seen = true;
          pointer.x = event.clientX;
          pointer.y = event.clientY;
          dom.pointerGlow && dom.pointerGlow.classList.add("is-on");
        }
      },
      { passive: true }
    );

    document.addEventListener("pointerleave", () => {
      pointer.tx = 0;
      pointer.ty = 0;
      dom.pointerGlow && dom.pointerGlow.classList.remove("is-on");
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) last = performance.now();
    });

    last = performance.now();
    raf = requestAnimationFrame(loop);
    window.addEventListener("pagehide", () => cancelAnimationFrame(raf));
  }

  /* ------------------------------------------------------------------ */
  /* 17. 启动                                                            */
  /* ------------------------------------------------------------------ */
  async function boot() {
    tickClock();
    setInterval(tickClock, 20000);

    renderInspiration();
    bindEvents();
    resizeInput();
    initFX();

    checkHealth();
    setInterval(checkHealth, 60000);

    await loadSessions();

    const saved = sessionStorage.getItem(STORE_KEY);
    if (saved) {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(saved)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const list = data.messages || [];
          if (list.length) {
            await openSession(saved);
          } else {
            sessionStorage.removeItem(STORE_KEY);
            showWelcome();
          }
        } else {
          sessionStorage.removeItem(STORE_KEY);
        }
      } catch (err) {
        /* 后端不可用时保持欢迎页 */
      }
    }

    if (document.body.classList.contains("is-booting")) {
      document.body.classList.remove("is-booting");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
