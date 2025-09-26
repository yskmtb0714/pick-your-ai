// AI Recommender — 4 questions, auto-advance, email-gated, teaser, Supabase + n8n
(function () {
  // --- ENV ---
  const ENV = window.ENV || {};
  const SUPABASE_URL = ENV.SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || "";
  const N8N_WEBHOOK_URL = ENV.N8N_WEBHOOK_URL || "";

  // Supabase
  let sb = null;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // UTM
  const url = new URL(window.location.href);
  const utm = {
    source: url.searchParams.get("utm_source") || url.searchParams.get("source") || undefined,
    medium: url.searchParams.get("utm_medium") || url.searchParams.get("medium") || undefined,
    campaign: url.searchParams.get("utm_campaign") || url.searchParams.get("campaign") || undefined,
  };

  // State
  const state = {
    step: 1,
    submitting: false,
    responseId: null,
    answers: { use_case: null, category: null, priority: null, q3_key: null, q3_value: null, email: null, utm },
    results: null,
  };

  // DOM helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Grab nodes
  const quizModal = $("#quizModal");
  const progressBar = $("#progressBar");
  const progressText = $("#progressText");
  const progressDetail = $("#progressDetail");
  const formError = $("#formError");
  const backBtn = $("#backBtn");
  const nextBtn = $("#nextBtn");
  const submitBtn = $("#submitBtn");
  const emailInput = $("#emailInput");

  const resultsSection = $("#resultsSection");
  const resultsContent = $("#resultsContent");
  const teaserBanner = $("#teaserBanner");
  const unlockResultsBtn = $("#unlockResultsBtn");
  const resultsNote = $("#resultsNote");

  const copyLinkBtn = $("#copyLinkBtn");
  const tryAgainBtn = $("#tryAgainBtn");
  const saveResultBtn = $("#saveResultBtn");
  const toastContainer = $("#toastContainer");

  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Analytics (no-op if not loaded)
  const trackGA = (e, p = {}) => window.gtag && window.gtag("event", e, p);
  const trackPX = (e, p = {}) => window.fbq && window.fbq("trackCustom", e, p);

  // DB helpers (NOTE: your tables are 'responses' & 'events'。Supabase側も同名で作成してね)
  async function insertResponse(payload) {
    if (!sb) return null;
    const { data, error } = await sb.from("responses").insert(payload).select("id").single();
    if (error) {
      console.error(error);
      return null;
    }
    return data.id;
  }
  async function updateResponse(id, patch) {
    if (!sb || !id) return;
    const { error } = await sb.from("responses").update(patch).eq("id", id);
    if (error) console.error(error);
  }
  async function insertEvent(type, meta = {}) {
    if (!sb) return;
    const payload = { type, meta };
    if (state.responseId) payload.response_id = state.responseId;
    const { error } = await sb.from("events").insert(payload);
    if (error) console.error(error);
  }

  // Toast
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    toastContainer && toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // Progress
  function setProgress(step) {
    const total = 4;
    if (progressText) progressText.textContent = `${step}/${total}`;
    if (progressDetail)
      progressDetail.textContent = `Question ${step} of ${total} · ${step === 4 ? "Almost there!" : "Let’s go"}`;
    if (progressBar) progressBar.style.width = `${Math.round((step / total) * 100)}%`;
    if (backBtn) backBtn.disabled = step === 1;
    if (nextBtn) nextBtn.classList.toggle("hidden", !(step < 4));
    if (submitBtn) submitBtn.classList.toggle("hidden", step !== 4);
  }

  // Option sets
  const options = {
    use_case: ["chat", "code", "writing", "analysis", "research", "education", "creative"],
    priority: ["accuracy", "speed", "cost", "reasoning"],
  };

  const Q3_CONFIG = {
    Education: {
      question: "How do you want to use AI for learning?",
      options: [
        { label: "Study assistant (Q&A, tutoring)", key: "tutor" },
        { label: "Research tool (summaries, references)", key: "research" },
        { label: "Practice skills (languages, problem solving)", key: "practice" },
      ],
    },
    Writing: {
      question: "What type of writing help do you need most?",
      options: [
        { label: "Creative writing / stories", key: "creative" },
        { label: "Professional docs (emails, reports)", key: "pro_docs" },
        { label: "Academic writing / papers", key: "academic" },
      ],
    },
    Coding: {
      question: "How should AI support your coding?",
      options: [
        { label: "Code completion & debugging", key: "code_completion" },
        { label: "Learn new frameworks / languages", key: "learn_code" },
        { label: "Automate repetitive tasks", key: "automation" },
      ],
    },
    Business: {
      question: "What’s your top priority for AI in business?",
      options: [
        { label: "Save time on tasks", key: "save_time" },
        { label: "Generate content (marketing/sales)", key: "gen_content" },
        { label: "Data analysis & insights", key: "analytics" },
      ],
    },
    Other: {
      question: "What matters most to you?",
      options: [
        { label: "Easy to use, no setup", key: "easy" },
        { label: "Specialized for my task", key: "specialized" },
        { label: "Flexible (integrations, advanced)", key: "flexible" },
      ],
    },
  };

  function deriveCategory(uc) {
    switch ((uc || "").toLowerCase()) {
      case "education":
        return "Education";
      case "writing":
        return "Writing";
      case "code":
        return "Coding";
      case "analysis":
      case "research":
        return "Business";
      default:
        return "Other";
    }
  }

  // Renderers
  function renderOptions(stepEl, key) {
    const grid = stepEl.querySelector('[role="radiogroup"]');
    grid.innerHTML = "";
    options[key].forEach((val) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-option", key);
      btn.className = "quiz-option";
      btn.textContent = val[0].toUpperCase() + val.slice(1);
      btn.addEventListener("click", () => {
        state.answers[key] = val;
        if (key === "use_case") {
          state.answers.category = deriveCategory(val);
          state.answers.q3_key = null;
          state.answers.q3_value = null;
        }
        $$('[data-option="' + key + '"]', grid).forEach((x) => x.setAttribute("aria-checked", "false"));
        btn.setAttribute("aria-checked", "true");
        gotoStep(state.step + 1); // auto-advance
      });
      grid.appendChild(btn);
    });
  }

  function renderQ3() {
    const step3 = $("#step3");
    const label = step3.querySelector("label");
    const grid = step3.querySelector('[role="radiogroup"]');
    const cfg = Q3_CONFIG[state.answers.category || deriveCategory(state.answers.use_case) || "Other"] || Q3_CONFIG.Other;
    label.textContent = cfg.question;
    grid.setAttribute("aria-label", cfg.question);
    grid.innerHTML = "";
    cfg.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-option";
      btn.textContent = opt.label;
      btn.setAttribute("data-option", "q3");
      btn.addEventListener("click", () => {
        state.answers.q3_key = opt.key;
        state.answers.q3_value = opt.label;
        $$('[data-option="q3"]', grid).forEach((x) => x.setAttribute("aria-checked", "false"));
        btn.setAttribute("aria-checked", "true");
        gotoStep(4);
      });
      grid.appendChild(btn);
    });
  }

  function gotoStep(n) {
    if (n < 1 || n > 4) return;
    state.step = n;
    ["#step1", "#step2", "#step3", "#step4"].forEach((sel, idx) => {
      const el = $(sel);
      el && el.classList.toggle("hidden", idx !== n - 1);
    });
    setProgress(n);
    formError && formError.classList.add("hidden");
    if (n === 3) renderQ3();
    if (n === 4 && emailInput) {
      emailInput.focus();
    }
  }

  // Open/Close
  function openQuiz() {
    state.step = 1;
    renderOptions($("#step1"), "use_case");
    renderOptions($("#step2"), "priority");
    renderQ3();
    setProgress(1);
    quizModal && quizModal.classList.remove("hidden");
    insertEvent("quiz_start");
  }
  function closeQuiz() {
    quizModal && quizModal.classList.add("hidden");
  }

  // Validation
  function validateStep() {
    if (state.step === 1 && !state.answers.use_case) return "Please select a primary use case.";
    if (state.step === 2 && !state.answers.priority) return "Please select what you value most.";
    if (state.step === 3 && !state.answers.q3_key) return "Please select one option.";
    if (state.step === 4) {
      const v = (emailInput && emailInput.value || "").trim();
      if (!/^\S+@\S+\.\S+$/.test(v)) return "Please enter a valid email.";
      state.answers.email = v;
    }
    return null;
  }

  // Results
  function renderResults(result) {
    resultsSection && resultsSection.classList.remove("hidden");
    if (resultsContent) resultsContent.innerHTML = "";
    const top = Array.isArray(result?.top) ? result.top.slice(0, 3) : [];
    top.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "result-card";
      if (idx > 0) card.classList.add("blur");
      card.innerHTML = `
        <div class="rank-badge">#${item.rank ?? idx + 1}</div>
        <div class="text-sm text-slate-500">Score: ${item.score ?? "—"}</div>
        <div class="mt-1 text-lg font-semibold">${item.model || "Model"}</div>
        <p class="mt-2 text-slate-700 text-sm">${item.reason || ""}</p>`;
      resultsContent && resultsContent.appendChild(card);
    });
    if (resultsNote) resultsNote.textContent = result?.note || "";
    teaserBanner && teaserBanner.classList.remove("hidden");
    insertEvent("recommendation_shown");
  }
  function unblurResults() {
    $$(".result-card.blur").forEach((el) => el.classList.remove("blur"));
    teaserBanner && teaserBanner.classList.add("hidden");
  }

  // Submit
  async function submitQuiz() {
    if (state.submitting) return;
    const err = validateStep();
    if (err) {
      if (formError) {
        formError.textContent = err;
        formError.classList.remove("hidden");
      }
      return;
    }

    state.submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Revealing...";
    }

    const client_ts = new Date().toISOString();
    const dbPayload = {
      use_case: state.answers.use_case,
      priority: state.answers.priority,
      channel: state.answers.q3_key || "n/a",
      email: state.answers.email,
      client_ts,
      utm: state.answers.utm,
      status: "received",
    };
    const webhookPayload = {
      use_case: state.answers.use_case,
      category: deriveCategory(state.answers.use_case),
      priority: state.answers.priority,
      q3_key: state.answers.q3_key,
      q3_value: state.answers.q3_value,
      email: state.answers.email,
      client_ts,
      utm: state.answers.utm,
    };

    insertEvent("quiz_submit");
    state.responseId = await insertResponse(dbPayload);

    closeQuiz();

    let controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    let ok = false,
      respJson = null;
    try {
      if (N8N_WEBHOOK_URL) {
        const resp = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        });
        ok = resp.ok;
        if (ok) respJson = await resp.json();
      }
    } catch (e) {
      console.warn("Webhook error", e);
    }
    clearTimeout(timeoutId);

    if (!ok || !respJson) {
      // graceful fallback
      if (resultsContent) resultsContent.innerHTML = "";
      renderResults({ top: [], note: "Your results are processing — we’ll email your picks soon." });
      await updateResponse(state.responseId, { status: "pending" });
      toast("We’ll email your picks soon.");
    } else {
      state.results = respJson;
      renderResults(respJson);
      await updateResponse(state.responseId, { status: "recommended", result: respJson });
      unblurResults();
    }

    state.submitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Reveal now";
    }
  }

  // Copy link
  async function copyResultLink() {
    const l = new URL(window.location.href);
    if (state.responseId) l.searchParams.set("rid", state.responseId);
    try {
      await navigator.clipboard.writeText(l.toString());
      toast("Link copied to clipboard");
    } catch {
      toast("Copy failed");
    }
  }

  // Save result (manual)
  async function saveCurrentResult() {
    if (!sb) {
      toast("Supabase not configured");
      return;
    }
    if (!state.results) {
      toast("No result to save");
      return;
    }
    await updateResponse(state.responseId, { status: "recommended", result: state.results });
    toast("Saved");
  }

  // Wire up buttons (null-safe)
  on($("#startQuizHero"), "click", () => {
    insertEvent("cta_click", { action: "start_quiz", placement: "hero" });
    openQuiz();
  });
  on($("#startQuizNav"), "click", () => {
    insertEvent("cta_click", { action: "start_quiz", placement: "nav" });
    openQuiz();
  });
  on($("#startQuizFooter"), "click", () => {
    insertEvent("cta_click", { action: "start_quiz", placement: "footer" });
    openQuiz();
  });
  on($("#closeQuiz"), "click", () => closeQuiz());

  on(backBtn, "click", () => gotoStep(Math.max(1, state.step - 1)));
  on(nextBtn, "click", () => gotoStep(Math.min(4, state.step + 1)));
  on(submitBtn, "click", submitQuiz);

  on(unlockResultsBtn, "click", () => {
    unblurResults();
    insertEvent("cta_click", { action: "unlock_results" });
  });

  on(tryAgainBtn, "click", () => {
    resultsSection && resultsSection.classList.add("hidden");
    openQuiz();
  });
  on(copyLinkBtn, "click", () => {
    insertEvent("cta_click", { action: "copy_link" });
    copyResultLink();
  });
  on(saveResultBtn, "click", saveCurrentResult);

  // Smooth scroll for in-page anchors (#how, #privacy, #terms)
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      if (!el) return; // allow default if not found
      e.preventDefault();
      quizModal && quizModal.classList.add("hidden");
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // page view
  window.addEventListener("load", () => {
    insertEvent("page_view");
    trackGA("page_view");
    trackPX("page_view");
  });
})();
