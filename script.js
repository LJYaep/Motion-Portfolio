"use strict";

/* Public contact settings only. SMTP and webhook secrets belong in server.env.
   Serve this folder over HTTP for YouTube playback; no framework or build step. */
const SITE_CONFIG = Object.freeze({
  email: "daniljy.aep@gmail.com",
  emailRecipients: ["daniljy.aep@gmail.com", "denial.aep@gmail.com"],
  enquiryEndpoint: "/api/enquiries",
  discord: "", // Optional public profile/invite. Notification webhook stays on the server.
  instagram: "https://www.instagram.com/ljyaep/",
  youtube: "https://www.youtube.com/@LJYaep"
});

(() => {
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  // The browser posts to the private server endpoint. SMTP and webhook secrets
  // never enter this file. Only a durable server acceptance counts as success.
  const form = $("#enquiry-form");
  if (form) {
    const serviceParam = new URLSearchParams(window.location.search).get("service");
    if ($$("#service option").some(option => option.value === serviceParam)) $("#service").value = serviceParam;
    const preference = $("#preferred-contact");
    const handleField = $("#contact-handle-field");
    const handleInput = $("#contact-handle");
    const submit = $("#submit-enquiry");
    const status = $("#submission-status");
    let busy = false, submitted = false, messageText = "", requestKey = "", requestSignature = "";

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

    if (["http:", "https:"].includes(window.location.protocol)) {
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
      if (!busy && submitted) {
        submitted = false;
        submit.disabled = false;
        submit.textContent = "Send enquiry ↗";
        status.hidden = true;
        $("#enquiry-result").hidden = true;
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || submitted || !form.reportValidity()) return;
      const data = {
        name: $("#name").value.trim(), email: $("#email").value.trim(), service: $("#service").value,
        budget: $("#budget").value.trim(), timeline: $("#timeline").value,
        message: $("#message").value.trim(), preferred_contact: preference.value,
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
        if (!submitted) submit.textContent = "Send enquiry ↗";
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
})();
