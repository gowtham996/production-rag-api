(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const uploadStatus = document.getElementById("upload-status");
  const docList = document.getElementById("doc-list");
  const messages = document.getElementById("messages");
  const form = document.getElementById("ask-form");
  const questionInput = document.getElementById("question-input");
  const sendBtn = document.getElementById("send-btn");

  let hasDocs = false;

  // ── Upload status helper ─────────────────────────────────

  function setUploadStatus(kind, text) {
    uploadStatus.hidden = false;
    uploadStatus.className = "upload-status" + (kind ? ` ${kind}` : "");
    uploadStatus.innerHTML = "";
    if (kind === "loading") {
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      uploadStatus.appendChild(spinner);
    }
    uploadStatus.appendChild(document.createTextNode(text));
  }

  function clearEmptyState() {
    const empty = messages.querySelector(".empty-state");
    if (empty) empty.remove();
  }

  function addDocToList(name, pages, chunks) {
    if (!hasDocs) {
      docList.innerHTML = "";
      hasDocs = true;
    }
    const li = document.createElement("li");
    li.className = "doc-item";
    li.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 2v6h6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="doc-name" title="${name}">${name}</span>
      <span class="doc-meta">${chunks} chunks</span>
    `;
    docList.appendChild(li);
    questionInput.disabled = false;
    sendBtn.disabled = false;
  }

  // ── Upload flow ───────────────────────────────────────────

  async function uploadFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadStatus("error", "Only PDF files are allowed.");
      return;
    }

    setUploadStatus("loading", `Processing ${file.name}…`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || `Upload failed (${res.status})`);
      }

      setUploadStatus("success", `${data.filename} indexed — ${data.chunks_stored} chunks`);
      addDocToList(data.filename, data.pages_loaded, data.chunks_stored);
    } catch (err) {
      setUploadStatus("error", err.message || "Upload failed. Try again.");
    }
  }

  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) uploadFile(fileInput.files[0]);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });

  // ── Chat flow ─────────────────────────────────────────────

  function addMessage({ role, text, sources, tokens, latency, isError }) {
    clearEmptyState();

    const msg = document.createElement("div");
    msg.className = `msg ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = role === "user" ? "Y" : "R";

    const body = document.createElement("div");
    body.className = "msg-body";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble" + (isError ? " error" : "");
    bubble.textContent = text;
    body.appendChild(bubble);

    if (sources && sources.length) {
      const meta = document.createElement("div");
      meta.className = "msg-meta";
      sources.forEach((s) => {
        const chip = document.createElement("span");
        chip.className = "source-chip";
        chip.textContent = s;
        meta.appendChild(chip);
      });
      body.appendChild(meta);
    }

    if (typeof latency === "number") {
      const stat = document.createElement("div");
      stat.className = "stat-line";
      stat.textContent = `${latency}ms · ${tokens ?? 0} tokens`;
      body.appendChild(stat);
    }

    msg.appendChild(avatar);
    msg.appendChild(body);
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function addTypingIndicator() {
    clearEmptyState();
    const msg = document.createElement("div");
    msg.className = "msg assistant";
    msg.innerHTML = `
      <div class="msg-avatar">R</div>
      <div class="msg-body">
        <div class="msg-bubble typing"><span></span><span></span><span></span></div>
      </div>
    `;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  async function askQuestion(question) {
    addMessage({ role: "user", text: question });
    const typingEl = addTypingIndicator();

    questionInput.disabled = true;
    sendBtn.disabled = true;

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json().catch(() => ({}));

      typingEl.remove();

      if (!res.ok) {
        throw new Error(data.detail || `Request failed (${res.status})`);
      }

      addMessage({
        role: "assistant",
        text: data.answer,
        sources: data.sources,
        tokens: data.tokens_used,
        latency: data.latency_ms,
      });
    } catch (err) {
      typingEl.remove();
      addMessage({ role: "assistant", text: err.message || "Something went wrong.", isError: true });
    } finally {
      questionInput.disabled = false;
      sendBtn.disabled = false;
      questionInput.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const question = questionInput.value.trim();
    if (!question) return;
    questionInput.value = "";
    questionInput.style.height = "auto";
    askQuestion(question);
  });

  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  questionInput.addEventListener("input", () => {
    questionInput.style.height = "auto";
    questionInput.style.height = Math.min(questionInput.scrollHeight, 160) + "px";
  });
})();
