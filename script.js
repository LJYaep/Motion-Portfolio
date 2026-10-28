"use strict";

/* Public contact settings only. SMTP and webhook secrets belong in server.env.
   Serve this folder over HTTP for YouTube playback; no framework or build step. */
const isGitHubPages = new URL(window.location.href).hostname.endsWith(".github.io");
const configuredEndpoint = window.LJY_PUBLIC_CONFIG?.enquiryEndpoint || "";
const enquiryEndpoint = configuredEndpoint || (isGitHubPages ? "" : "/api/enquiries");
const SITE_CONFIG = Object.freeze({
  email: "daniljy.aep@gmail.com",
  emailRecipients: ["daniljy.aep@gmail.com", "denial.aep@gmail.com"],
  enquiryEndpoint,
  discord: "", // Optional public profile/invite. Notification webhook stays on the server.
  instagram: "https://www.instagram.com/ljyaep/",
  youtube: "https://www.youtube.com/@LJYaep"
});

(() => {
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let motionEnabled = false;
  const motionAnimations = new Set();
  const elementMotions = new WeakMap();
  function animateElement(element, frames, options = {}) {
    if (!motionEnabled || !element?.animate) return;
    elementMotions.get(element)?.cancel();
    const animation = element.animate(frames, { duration: 550, easing: "cubic-bezier(.22,1,.36,1)", ...options });
    motionAnimations.add(animation);
    elementMotions.set(element, animation);
    const release = () => motionAnimations.delete(animation);
    animation.addEventListener("finish", release, { once: true });
    animation.addEventListener("cancel", release, { once: true });
    return animation;
  }
  function animateProjectLayout(before) {
    projectCards.filter(card => !card.hidden).forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const previous = before.get(card);
      const x = previous ? previous.left - rect.left : 0;
      const y = previous ? previous.top - rect.top : 22;
      animateElement(card, [{ opacity: previous ? 1 : 0, transform: `translate(${x}px, ${y}px)` }, { opacity: 1, transform: "translate(0, 0)" }], { duration: 480, delay: Math.min(index * 35, 175) });
    });
  }

  // Browser-level deterrents, not access control. Do not interfere with visitors'
  // own form text or put overlays over the third-party YouTube player.
  const isEditable = target => Boolean(target?.closest?.("input, textarea, [contenteditable='true']"));
  document.addEventListener("selectstart", event => {
    if (!isEditable(event.target)) event.preventDefault();
  });
  document.addEventListener("copy", event => {
    if (!isEditable(event.target)) event.preventDefault();
  });
  document.addEventListener("dragstart", event => {
    if (!isEditable(event.target)) event.preventDefault();
  });

  // A file:// document cannot supply the normal website HTTP Referer. Avoid
  // broken local-file embeds and use the real HTTP(S) origin when served.
  const canEmbedYouTube = ["http:", "https:"].includes(window.location.protocol);
  const monitoredPlayers = new Map();
  let youtubeApiRequested = false;

  function playerErrorMessage(code) {
    const messages = {
      2: "YouTube rejected this video link. Please use Watch on YouTube.",
      5: "YouTube could not play this video in this browser. Please use Watch on YouTube.",
      100: "YouTube reports this video as unavailable or private. Open it on YouTube to check its availability.",
      101: "YouTube is blocking embedded playback for this video. Please use Watch on YouTube.",
      150: "YouTube is blocking embedded playback for this video. Please use Watch on YouTube.",
      153: "YouTube did not receive the website identification. Open this site through START-WEBSITE.bat or hosting, then reload."
    };
    return `${messages[code] || "This preview could not play here. Please use Watch on YouTube."} (YouTube error ${code})`;
  }

  function connectPlayerMonitor(record) {
    if (!window.YT?.Player || !record.frame.isConnected || record.apiPlayer) return;
    try {
      record.apiPlayer = new window.YT.Player(record.frame, {
        events: {
          onReady: () => {
            if (monitoredPlayers.get(record.frame.id) === record) record.feedback.hidden = true;
          },
          onError: event => {
            if (monitoredPlayers.get(record.frame.id) !== record) return;
            record.feedback.textContent = playerErrorMessage(Number(event.data));
            record.feedback.hidden = false;
          }
        }
      });
    } catch {
      record.feedback.textContent = "If this preview does not play, use Watch on YouTube.";
      record.feedback.hidden = false;
    }
  }

  function monitorPlayer(frame, feedback) {
    if (!feedback) return;
    feedback.hidden = true;
    const record = { frame, feedback, apiPlayer: null };
    monitoredPlayers.set(frame.id, record);
    if (window.YT?.Player) {
      connectPlayerMonitor(record);
      return;
    }
    if (youtubeApiRequested) return;
    youtubeApiRequested = true;
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { if (typeof previousReady === "function") previousReady(); } finally {
        monitoredPlayers.forEach(connectPlayerMonitor);
      }
    };
    const apiScript = document.createElement("script");
    apiScript.src = "https://www.youtube.com/iframe_api";
    apiScript.async = true;
    apiScript.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    apiScript.addEventListener("error", () => {
      monitoredPlayers.forEach(item => {
        item.feedback.textContent = "If this preview does not play, use Watch on YouTube.";
        item.feedback.hidden = false;
      });
    });
    document.head.appendChild(apiScript);
  }

  function stopPlayer(frameId) {
    const record = monitoredPlayers.get(frameId);
    monitoredPlayers.delete(frameId);
    if (record?.apiPlayer) record.apiPlayer.destroy();
    if (record) record.feedback.hidden = true;
  }

  function youtubePlayer(videoId, title, autoplay = false) {
    if (!canEmbedYouTube || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    const source = new URL(`https://www.youtube.com/embed/${videoId}`);
    source.searchParams.set("playsinline", "1");
    source.searchParams.set("rel", "0");
    source.searchParams.set("origin", window.location.origin);
    source.searchParams.set("autoplay", autoplay ? "1" : "0");
    source.searchParams.set("enablejsapi", "1");
    const player = document.createElement("iframe");
    player.setAttribute("src", source.href);
    player.setAttribute("title", title);
    player.setAttribute("width", "1280");
    player.setAttribute("height", "720");
    player.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    player.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    player.setAttribute("allowfullscreen", "");
    player.setAttribute("draggable", "false");
    return player;
  }
  const showreelMount = $("#showreel-mount");
  if (showreelMount && canEmbedYouTube) {
    const player = youtubePlayer(showreelMount.dataset.showreel, "LJY showreel 2026 — video editing and motion design");
    if (player) {
      player.setAttribute("id", "showreel-player");
      showreelMount.replaceChildren(player);
      monitorPlayer(player, $("#showreel-feedback"));
    }
  }

  // Navigation remains regular HTML links, including when JavaScript is unavailable.
  const menu = $(".menu-toggle");
  const nav = $("#site-nav");
  function closeMenu() {
    nav?.classList.remove("is-open");
    menu?.setAttribute("aria-expanded", "false");
  }
  menu?.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    if (open) {
      animateElement(nav, [{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 280 });
      $$("a", nav).forEach((link, index) => animateElement(link, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { delay: index * 40, duration: 320 }));
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu?.getAttribute("aria-expanded") === "true") {
      closeMenu();
      menu.focus();
    }
  });
  document.addEventListener("click", event => {
    if (menu && !menu.contains(event.target) && !nav.contains(event.target)) closeMenu();
  });
  window.matchMedia("(min-width: 701px)").addEventListener("change", closeMenu);

  // Unconfigured social links lead to the contact page instead of invented profiles.
  $$('[data-social]').forEach(link => {
    const value = SITE_CONFIG[link.dataset.social];
    if (!value) return;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return;
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } catch { /* Ignore incomplete configuration. */ }
  });
  const configuredEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SITE_CONFIG.email) ? SITE_CONFIG.email : "";
  if (configuredEmail) {
    $$('[data-email], .footer-links a:first-child').forEach(link => {
      link.href = "mailto:" + configuredEmail;
    });
  }
  // Social URLs come from the supplied portfolio and current video metadata.

  // Work-page filters preserve normal DOM order and announce the result count.
  const filters = $$("[data-filter]");
  const projectCards = $$(".project-card");
  filters.forEach(button => button.addEventListener("click", () => {
    motionAnimations.forEach(animation => animation.cancel());
    const before = new Map(projectCards.filter(card => !card.hidden).map(card => [card, card.getBoundingClientRect()]));
    filters.forEach(filter => {
      const selected = filter === button;
      filter.classList.toggle("active", selected);
      filter.setAttribute("aria-pressed", String(selected));
    });
    let visible = 0;
    projectCards.forEach(card => {
      const categories = (card.dataset.category || "").split(/\s+/);
      card.hidden = button.dataset.filter !== "all" && !categories.includes(button.dataset.filter);
      if (!card.hidden) visible++;
    });
    $("#project-count").textContent = `Showing ${visible} project${visible === 1 ? "" : "s"}`;
    $$("[data-project-group]").forEach(group => {
      group.hidden = ! $$(".project-card", group).some(card => !card.hidden);
    });
    animateProjectLayout(before);
  }));

  // Cards remain normal YouTube links without JavaScript. When available,
  // the native dialog adds inline playback, keyboard focus and Escape-to-close.
  const dialog = $("#project-dialog");
  let lastProjectLink;
  $$("[data-video]").forEach(link => link.addEventListener("click", event => {
    if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const videoId = link.dataset.video;
    if (!canEmbedYouTube || !dialog || typeof dialog.showModal !== "function" || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
    event.preventDefault();
    lastProjectLink = link;
    $("#dialog-title").textContent = link.dataset.title;
    $("#dialog-category").textContent = link.dataset.labels;
    $("#dialog-watch").href = `https://www.youtube.com/watch?v=${videoId}`;
    const player = youtubePlayer(videoId, link.dataset.title, true);
    player.setAttribute("id", "project-player");
    $("#dialog-art").replaceChildren(player);
    dialog.showModal();
    animateElement(dialog, [{ opacity: 0, transform: "translateY(16px) scale(.98)" }, { opacity: 1, transform: "translateY(0) scale(1)" }], { duration: 320 });
    monitorPlayer(player, $("#dialog-feedback"));
    document.body.classList.add("modal-open");
  }));
  $(".close-dialog")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog?.addEventListener("close", () => {
    // Removing the player stops playback and audio, including after Escape.
    stopPlayer("project-player");
    $("#dialog-art").replaceChildren();
    document.body.classList.remove("modal-open");
    lastProjectLink?.focus();
  });

  // Thumbnails are bundled locally; the underlying graphic remains a fallback.
  $$(".project-thumbnail img, .game-art img").forEach(image => {
    image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  });
  if (window.location.protocol === "file:") {
    $$(".local-playback-note").forEach(note => { note.hidden = false; });
  }

  // Numeric fields accept amounts, not currency symbols or scientific notation.
  $$("[type='number']").forEach(field => {
    let lastValid = field.value;
    const numberText = () => field.step === "1" ? /^\d*$/ : /^\d*(?:\.\d{0,2})?$/;
    field.addEventListener("keydown", event => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !/[0-9.]/.test(event.key)) event.preventDefault();
    });
    field.addEventListener("beforeinput", event => {
      if (event.data && (field.step === "1" ? /[^0-9]/ : /[^0-9.]/).test(event.data)) event.preventDefault();
    });
    field.addEventListener("paste", event => {
      const value = event.clipboardData?.getData("text").trim();
      if (value !== undefined && !/^\d+(?:\.\d{1,2})?$/.test(value)) event.preventDefault();
    });
    field.addEventListener("input", () => {
      if (numberText().test(field.value)) lastValid = field.value;
      else field.value = lastValid;
    });
  });

  // The browser posts to the private server endpoint. SMTP and webhook secrets
  // never enter this file. Only a durable server acceptance counts as success.
  const form = $("#enquiry-form");
  if (form) {
    let serviceParam = new URLSearchParams(window.location.search).get("service");
    if (["animation", "editing"].includes(serviceParam)) serviceParam = "motion";
    if (serviceParam === "both") serviceParam = "discuss";
    const agreementEndpoint = window.LJY_PUBLIC_CONFIG?.agreementEndpoint || "";
    const hasAgreementDelivery = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(agreementEndpoint);
    const dateStart = $("#start-date"), dateEnd = $("#end-date");
    function validateDates() {
      dateEnd.min = dateStart.value;
      dateEnd.setCustomValidity(dateStart.value && dateEnd.value && dateEnd.value < dateStart.value ? "Finish date must be on or after the start date." : "");
    }
    dateStart.addEventListener("change", validateDates);
    dateEnd.addEventListener("change", validateDates);
    const payment = $("#payment-method"), amount = $("#budget"), currency = $("#budget-currency");
    function updatePayment() {
      const robux = payment.value === "robux";
      currency.value = robux ? "ROBUX" : (currency.value === "ROBUX" ? "SGD" : currency.value);
      currency.disabled = robux;
      amount.step = robux ? "1" : "0.01";
      const type = $("#service").value;
      amount.min = robux ? (type === "motion" ? "6000" : ["roblox", "modelling"].includes(type) ? "25000" : "0") : "0";
      $("#budget-hint").textContent = robux ? "Robux is a backup option. Minimum: 6,000 for motion/videos; 25,000 for building/modelling. Choose Discuss first if you’re unsure of the project type; the budget is confirmed after review. Whole numbers only." : "Proposed amount only. Numbers with up to 2 decimal places; the final agreed price is confirmed in SGD.";
    }
    payment.addEventListener("change", updatePayment);
    $("#service").addEventListener("change", updatePayment);
    currency.addEventListener("change", () => { if (currency.value === "ROBUX") payment.value = "robux"; updatePayment(); });
    if (hasAgreementDelivery) {
      form.setAttribute("action", agreementEndpoint);
      $("#processor-note").textContent = "Your details are processed through Dani’s private Google document and email workflow. The draft agreement goes to Dani for review first.";
    }
    $("#request-id").value = window.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if ($$("#service option").some(option => option.value === serviceParam)) $("#service").value = serviceParam;
    updatePayment();
    const preference = $("#preferred-contact");
    const handleField = $("#contact-handle-field");
    const handleInput = $("#contact-handle");
    const submit = $("#submit-enquiry");
    const status = $("#submission-status");
    let busy = false, submitted = false, messageText = "", requestKey = "", requestSignature = "";
    let nativeTimeout;
    function resetNativeSubmission() {
      clearTimeout(nativeTimeout);
      busy = false;
      form.removeAttribute("aria-busy");
      submit.disabled = false;
      submit.textContent = "Send project request ↗";
    }
    window.addEventListener("pageshow", event => {
      if (event.persisted) {
        resetNativeSubmission();
        status.hidden = false;
        status.classList.add("is-error");
        status.textContent = "You have returned to the form. Delivery is not confirmed here; check the provider’s result before submitting again.";
      }
    });
    function watchNativeSubmission() {
      // Navigation is not evidence of delivery. If the provider stalls or navigation
      // is blocked, keep a recoverable local copy and never report false success.
      busy = true;
      form.setAttribute("aria-busy", "true");
      submit.disabled = true;
      submit.textContent = "Connecting…";
      const labels = {name:"Client name",client_group:"Company / group",email:"Email",service:"Project type",preferred_contact:"Preferred reply",contact_handle:"Social username",payment_method:"Payment preference",payment_channel:"Payment method",currency:"Currency",budget:"Proposed budget",start_date:"Requested start",end_date:"Requested finish",device_target:"Device requirements",message:"Project details"};
      const lines = ["LJY — Project request (delivery not confirmed)", ""];
      Object.entries(labels).forEach(([name, label]) => {
        const field = form.elements.namedItem(name);
        if (!field) return;
        const value = field.tagName === "SELECT" ? field.selectedOptions[0]?.textContent : field.value.trim();
        if (value) lines.push(label + ": " + value);
      });
      messageText = lines.join("\n");
      $("#enquiry-preview").value = messageText;
      nativeTimeout = setTimeout(() => {
        resetNativeSubmission();
        status.hidden = false;
        status.classList.add("is-error");
        status.textContent = "The submission service is taking longer than expected. Delivery has not been confirmed. Keep a copy below and contact Dani by email or Instagram before retrying.";
        $("#enquiry-result-title").textContent = "Keep a copy of your project request";
        $("#enquiry-status").textContent = "Nothing on this page confirms delivery. You can copy or download the details for your records.";
        $("#email-enquiry").hidden = true;
        $("#enquiry-result").hidden = false;
      }, 15000);
    }

    function updatePreference() {
      const social = preference.value !== "email";
      handleField.hidden = !social;
      handleInput.required = social;
      $("#contact-handle-label").textContent = preference.value === "discord" ? "Discord username" : "Instagram username";
      handleInput.placeholder = preference.value === "instagram" ? "@yourusername" : "Your Discord username";
    }
    preference.addEventListener("change", updatePreference);
    updatePreference();
    $$("[data-contact-method]").forEach(link => link.addEventListener("click", event => {
      if (!link.getAttribute("href").startsWith("#")) return;
      event.preventDefault();
      preference.value = link.dataset.contactMethod;
      updatePreference();
      handleInput.focus();
      form.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
    }));

    if (!SITE_CONFIG.enquiryEndpoint) {
      $("#form-mode").textContent = hasAgreementDelivery ? "Your request prepares a draft agreement for Dani’s review. Dani will send you the reviewed agreement separately." : "Your project request goes to Dani for review. The agreement will be sent separately after scope, price and dates are confirmed.";
      submit.textContent = "Send project request ↗";
    }

    if (!hasAgreementDelivery && SITE_CONFIG.enquiryEndpoint && ["http:", "https:"].includes(window.location.protocol)) {
      fetch(SITE_CONFIG.enquiryEndpoint.replace(/\/enquiries$/, "/config"), { credentials: "same-origin" })
        .then(response => response.ok ? response.json() : null)
        .then(config => {
          if (!config) return;
          if (!config.emailConfigured) $("#form-mode").textContent = "Online enquiries are temporarily unavailable. Please email me or contact me on Instagram.";
          if (config.discordContactUrl) {
            $$("[data-social='discord']").forEach(link => {
              link.href = config.discordContactUrl;
              link.textContent = "Contact on Discord ↗";
              link.target = "_blank";
              link.rel = "noopener noreferrer";
            });
          }
        }).catch(() => {});
    }

    form.addEventListener("input", () => {
      if (!busy) $("#request-id").value = window.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!busy && submitted) {
        submitted = false;
        submit.disabled = false;
        submit.textContent = "Send project request ↗";
        status.hidden = true;
        $("#enquiry-result").hidden = true;
      }
    });

    form.addEventListener("submit", async event => {
      validateDates();
      if ((hasAgreementDelivery || !SITE_CONFIG.enquiryEndpoint) && ["http:", "https:"].includes(window.location.protocol)) {
        if (busy) { event.preventDefault(); return; }
        // Native POST is required: FormSubmit autoresponses do not support AJAX.
        // Keep its CAPTCHA enabled and let the provider show the actual result.
        updatePreference();
        if (!form.reportValidity() || $("#company-website").value) {
          event.preventDefault();
          return;
        }
        if (preference.value === "email") handleInput.value = "";
        status.hidden = false;
        status.classList.remove("is-error");
        status.textContent = hasAgreementDelivery ? "Connecting to the agreement service…" : "Connecting to the submission service. Complete its spam check if prompted…";
        watchNativeSubmission();
        return;
      }
      event.preventDefault();
      if (busy || submitted || !form.reportValidity()) return;
      const data = {
        name: $("#name").value.trim(), email: $("#email").value.trim(), service: $("#service").value,
        budget: $("#budget").value.trim() ? `${$("#budget-currency").value} ${$("#budget").value.trim()}` : "", timeline: [$("#start-date").value, $("#end-date").value].filter(Boolean).join(" to "),
        message: [$("#message").value.trim(), "", `Client group: ${$("#client-group").value.trim() || "Not supplied"}`, `Requested start: ${$("#start-date").value || "To be discussed"}`, `Requested finish: ${$("#end-date").value || "To be discussed"}`, `Payment preference: ${payment.value}`, `Payment method: ${$("#payment-channel").value}`, `Device requirements: ${$("#device-target").value}`, "Request for freelancer review; no price or date is confirmed."].join("\n"), preferred_contact: preference.value,
        contact_handle: preference.value === "email" ? "" : handleInput.value.trim(),
        company_website: $("#company-website").value
      };
      if (!data.name || !data.message || (data.preferred_contact !== "email" && !data.contact_handle)) {
        status.hidden = false;
        status.classList.add("is-error");
        status.textContent = "Please enter your name, project details and preferred contact information.";
        return;
      }
      const service = $("#service").selectedOptions[0].textContent;
      messageText = ["LJY — Project enquiry", "", `Name: ${data.name}`, `Email: ${data.email}`, `Service: ${service}`, `Budget: ${data.budget || "To be discussed"}`, `Timeline: ${data.timeline || "To be discussed"}`, `Preferred reply: ${data.preferred_contact}`, `Social handle: ${data.contact_handle || "Not supplied"}`, "", "Project details", data.message].join("\n");
      $("#enquiry-preview").value = messageText;
      const mailLink = $("#email-enquiry");
      mailLink.href = `mailto:${SITE_CONFIG.emailRecipients.join(",")}?subject=${encodeURIComponent("Project enquiry — " + service)}&body=${encodeURIComponent(messageText)}`;
      mailLink.hidden = false;
      if (!SITE_CONFIG.enquiryEndpoint) {
        status.hidden = false;
        status.classList.remove("is-error");
        status.textContent = "Your enquiry is ready. Use Open email below, then send it from your email app. Nothing has been submitted yet.";
        $("#enquiry-result-title").textContent = "Send your enquiry by email";
        $("#enquiry-status").textContent = "This opens a draft addressed to both recipients. Automatic confirmation becomes available when online submission is connected.";
        $("#enquiry-result").hidden = false;
        return;
      }
      const signature = JSON.stringify(data);
      if (signature !== requestSignature) {
        requestSignature = signature;
        requestKey = window.crypto?.randomUUID?.() || `enquiry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      busy = true;
      submit.disabled = true;
      submit.textContent = "Submitting…";
      status.hidden = false;
      status.classList.remove("is-error");
      status.textContent = "Submitting your enquiry…";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        if (!["http:", "https:"].includes(window.location.protocol)) throw new Error("Run START-WEBSITE.bat to use the online form, or contact me by email or Instagram.");
        const response = await fetch(SITE_CONFIG.enquiryEndpoint, {
          method: "POST", credentials: "same-origin", signal: controller.signal,
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey }, body: JSON.stringify(data)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Your enquiry could not be submitted. Please try again or contact me directly.");
        if (!result.reference) throw new Error("Submission could not be confirmed. Please retry using this form.");
        submitted = true;
        status.textContent = `Your enquiry has been submitted. A confirmation will be emailed to ${data.email}. Reference: ${result.reference}`;
        $("#enquiry-result-title").textContent = "Enquiry submitted";
        $("#enquiry-status").textContent = "You can keep a copy for your records. Email delivery may take a little time.";
        submit.textContent = "Submitted ✓";
      } catch (error) {
        status.classList.add("is-error");
        status.textContent = error.name === "AbortError" ? "The request timed out. Please retry; the form will reuse the same submission reference to avoid duplicates." : (error instanceof TypeError ? "The server could not be reached. Please retry or use the email / Instagram contact links." : error.message);
        $("#enquiry-result-title").textContent = "Keep a copy of your enquiry";
        $("#enquiry-status").textContent = "Submission has not been confirmed. You can copy, download or email these details yourself.";
      } finally {
        clearTimeout(timeout);
        busy = false;
        submit.disabled = submitted;
        if (!submitted) submit.textContent = "Send project request ↗";
        $("#enquiry-result").hidden = false;
      }
    });

    $("#copy-enquiry").addEventListener("click", async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(messageText);
        $("#enquiry-status").textContent = "Message copied.";
      } catch {
        $("#enquiry-preview").focus();
        $("#enquiry-preview").select();
        $("#enquiry-status").textContent = "Message selected. Press Ctrl+C (Windows) or Command+C (Mac) to copy.";
      }
    });
    $("#download-enquiry").addEventListener("click", () => {
      const blob = new Blob([messageText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "LJY-project-enquiry.txt";
      document.body.appendChild(link);
      link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  // Progressive enhancement: all content and navigation work without motion.
  // No scroll interception, autoplay media, or hidden-until-JS content.
  if (window.addEventListener && document.documentElement) {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const heroOrbit = $(".hero-orbit");
    let orbitLine, orbitHighlight;
    const orbitStar = heroOrbit?.querySelector("span");
    if (heroOrbit && orbitStar && document.createElementNS) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 1000 400");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      const path = "M 950 112.822 A 500 200 0 1 1 50 287.178 A 500 200 0 1 1 950 112.822";
      ["orbit-line", "orbit-highlight"].forEach(className => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("d", path);
        line.setAttribute("pathLength", "1");
        line.setAttribute("class", className);
        line.setAttribute("vector-effect", "non-scaling-stroke");
        svg.appendChild(line);
        if (className === "orbit-line") orbitLine = line;
        else orbitHighlight = line;
      });
      heroOrbit.appendChild(svg);
      heroOrbit.classList.add("orbit-drawn");
    }
    function fitOrbitBelowNavigation() {
      if (!heroOrbit || !orbitStar || !Number.isFinite(heroOrbit.offsetWidth)) return;
      const hero = heroOrbit.closest(".hero"), parent = heroOrbit.offsetParent;
      if (!hero || !parent) return;
      heroOrbit.style.marginTop = "0px";
      const angle = -22 * Math.PI / 180;
      const radiusY = Math.hypot(heroOrbit.offsetWidth / 2 * Math.sin(angle), heroOrbit.offsetHeight / 2 * Math.cos(angle));
      const starRadius = Math.hypot(orbitStar.offsetWidth, orbitStar.offsetHeight) / 2;
      const top = parent.getBoundingClientRect().top + heroOrbit.offsetTop + heroOrbit.offsetHeight / 2 - radiusY - starRadius;
      const minimum = hero.getBoundingClientRect().top + 16;
      heroOrbit.style.marginTop = `${Math.ceil(Math.max(0, minimum - top))}px`;
    }
    fitOrbitBelowNavigation();
    function playOrbitEntrance() {
      if (!motionEnabled || !orbitLine) return;
      const timing = { duration: 1750, delay: 180, easing: "cubic-bezier(.35,0,.15,1)", fill: "backwards" };
      const pathLength = orbitLine.getTotalLength?.();
      const starFrames = Array.from({ length: 97 }, (_, index) => {
        const progress = index / 96;
        const angle = -Math.acos(.9) + Math.PI * 2 * progress;
        const point = pathLength ? orbitLine.getPointAtLength(pathLength * progress) : { x: 500 + 500 * Math.cos(angle), y: 200 + 200 * Math.sin(angle) };
        return {
          offset: progress,
          left: `${point.x / 10}%`,
          top: `${point.y / 4}%`,
          opacity: Math.min(1, progress * 16),
          transform: `translate(-50%, -50%) rotate(${-100 * (1 - progress)}deg) scale(${.65 + .35 * Math.min(1, progress * 6)})`
        };
      });
      animateElement(orbitStar, starFrames, timing);
      animateElement(orbitLine, [{ strokeDashoffset: "1" }, { strokeDashoffset: "0" }], timing);
      animateElement(orbitHighlight, [
        { strokeDashoffset: ".055", opacity: 0, offset: 0 },
        { strokeDashoffset: "-.045", opacity: .9, offset: .1 },
        { strokeDashoffset: "-.745", opacity: .6, offset: .8 },
        { strokeDashoffset: "-.945", opacity: 0, offset: 1 }
      ], timing);
    }
    let savedMotion = "";
    try { savedMotion = window.localStorage.getItem("ljy-motion") || ""; } catch { /* Storage can be unavailable. */ }
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "motion-toggle";
    toggle.setAttribute("aria-label", "Enable website animations");
    $(".site-header")?.appendChild(toggle);
    const progress = document.createElement("div");
    progress.className = "reading-progress";
    progress.setAttribute("aria-hidden", "true");
    document.body.appendChild(progress);
    function applyMotion() {
      motionEnabled = !preference.matches && savedMotion !== "off";
      document.body.classList.toggle("motion-enabled", motionEnabled);
      toggle.textContent = preference.matches ? "Motion reduced" : motionEnabled ? "Motion on" : "Motion off";
      toggle.setAttribute("aria-pressed", String(motionEnabled));
      toggle.disabled = preference.matches;
      toggle.title = preference.matches ? "Reduced motion is enabled in your device settings" : "Turn website animations on or off";
      if (!motionEnabled) {
        motionAnimations.forEach(animation => animation.cancel());
        if (heroOrbit) heroOrbit.style.transform = "";
      }
    }
    toggle.addEventListener("click", () => {
      savedMotion = motionEnabled ? "off" : "on";
      try { window.localStorage.setItem("ljy-motion", savedMotion); } catch { /* Optional preference storage. */ }
      applyMotion();
    });
    preference.addEventListener("change", applyMotion);
    applyMotion();
    playOrbitEntrance();
    $$(".hero .eyebrow, .hero h1, .hero-side > p, .hero-side .button-group").forEach((element, index) => {
      animateElement(element, [{ opacity: 0, transform: "translateY(26px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 850, delay: index * 85 });
    });
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          animateElement(entry.target, [{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 650 });
        });
      }, { threshold: .08, rootMargin: "0px 0px -24px 0px" });
      $$(".section-heading, .project-card, .service-row, .process-grid article, .about-intro, .intro-grid > div, .contact-band, .contact-intro, #enquiry-form").forEach(element => observer.observe(element));
    }
    let scrollFrame = 0;
    function updateProgress() {
      scrollFrame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
      progress.style.transform = `scaleX(${ratio})`;
      if (heroOrbit && motionEnabled) heroOrbit.style.transform = `rotate(-22deg) translate3d(0, ${Math.min(Math.max(window.scrollY, 0) * .06, 28)}px, 0)`;
    }
    function scheduleProgress() {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateProgress);
    }
    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", () => { fitOrbitBelowNavigation(); scheduleProgress(); }, { passive: true });
    window.addEventListener("pageshow", scheduleProgress);
    document.addEventListener("visibilitychange", () => {
      document.body.classList.toggle("motion-paused", document.hidden);
    });
    updateProgress();
  }
  // Show Dani's local time, independent of the visitor's device time zone.
  function singaporeClockState(now) {
    const zone = "Asia/Singapore";
    const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const hour = Number(timeFormat.formatToParts(now).find(part => part.type === "hour").value);
    return {
      time: timeFormat.format(now),
      date: new Intl.DateTimeFormat("en-SG", { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(now),
      period: hour >= 7 && hour < 19 ? "day" : "night"
    };
  }
  const localClock = $("#local-time");
  if (localClock) {
    const panel = $("#local-presence");
    let clockTimer = null;
    function updateLocalClock() {
      const now = new Date(), state = singaporeClockState(now);
      localClock.textContent = state.time;
      localClock.setAttribute("datetime", now.toISOString());
      $("#local-date").textContent = state.date + " · SGT (UTC+8)";
      $("#local-period").textContent = state.period === "day" ? "Daytime" : "Nighttime";
      panel.setAttribute("data-period", state.period);
    }
    function pauseLocalClock() {
      if (clockTimer !== null) window.clearInterval(clockTimer);
      clockTimer = null;
    }
    function resumeLocalClock() {
      pauseLocalClock();
      updateLocalClock();
      if (!document.hidden) clockTimer = window.setInterval(updateLocalClock, 1000);
    }
    document.addEventListener("visibilitychange", resumeLocalClock);
    window.addEventListener("pagehide", pauseLocalClock);
    window.addEventListener("pageshow", resumeLocalClock);
    resumeLocalClock();
  }

})();
