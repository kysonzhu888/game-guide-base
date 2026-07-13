const searchInput = document.querySelector("#guide-search");
const clearButton = document.querySelector("[data-clear-search]");
const cards = Array.from(document.querySelectorAll("[data-guide-card]"));
const paywallConfig = window.GGB_PAYWALL || {};
const paywallPages = Array.from(document.querySelectorAll("[data-premium-page]"));
const licenseForms = Array.from(document.querySelectorAll("[data-license-form]"));
const lockButtons = Array.from(document.querySelectorAll("[data-lock-access]"));
const memberStatusPanels = Array.from(document.querySelectorAll("[data-member-status-panel]"));
const accessPage = document.querySelector("[data-access-page]");

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    cards.forEach((card) => {
      const text = `${card.dataset.title || ""} ${card.dataset.genre || ""} ${card.dataset.platform || ""}`;
      card.hidden = query.length > 0 && !text.includes(query);
    });
  });
}

if (clearButton && searchInput) {
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    cards.forEach((card) => {
      card.hidden = false;
    });
    searchInput.focus();
  });
}

if (paywallPages.length) {
  applyAccessState(hasLifetimeAccess());
}

if (accessPage) {
  initAccessPage(accessPage);
}

licenseForms.forEach((form) => {
  const input = form.querySelector("input[name='licenseCode']");
  const status = form.querySelector("[data-license-status]");
  const gameSlug = form.closest("[data-guide-slug]")?.dataset.guideSlug || "";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = String(input?.value || "").trim();
    if (!value) {
      setLicenseStatus(status, "Enter your license key first.", "error");
      return;
    }

    trackFunnelEvent("license_attempt", { pageType: "guide", gameSlug });
    setLicenseStatus(status, "Checking license key...");
    const result = await validateAccess(value);
    if (!result.ok) {
      trackFunnelEvent("license_failure", { pageType: "guide", gameSlug });
      setLicenseStatus(status, result.error || "That license key did not unlock access.", "error");
      return;
    }

    trackFunnelEvent("license_success", { pageType: "guide", gameSlug });
    storeLifetimeAccess(value);
    input.value = "";
    applyAccessState(true);
    setLicenseStatus(status, result.message || "Unlocked on this browser.", "success");
  });
});

lockButtons.forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.removeItem(paywallStorageKey());
    applyAccessState(false);
  });
});

initCommentSections(document);

function initCommentSections(root) {
  root.querySelectorAll("[data-comment-section]").forEach((section) => {
  if (section.dataset.commentsInitialized === "true") return;
  section.dataset.commentsInitialized = "true";

  const gameSlug = section.dataset.gameSlug;
  const form = section.querySelector("[data-comment-form]");
  const list = section.querySelector("[data-comment-list]");
  const status = section.querySelector("[data-comment-status]");
  const count = section.querySelector("[data-comment-count]");
  const submit = section.querySelector("[data-comment-submit]");

  if (!gameSlug || !form || !list) return;

  const setStatus = (message, tone = "") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const setLoading = (isLoading) => {
    if (!submit) return;
    submit.disabled = isLoading;
    submit.textContent = isLoading ? "Posting..." : "Post";
  };

  const fetchComments = async () => {
    const response = await fetch(`/api/comments?gameSlug=${encodeURIComponent(gameSlug)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Could not load comments.");
    }
    return Array.isArray(payload.comments) ? payload.comments : [];
  };

  const postComment = async (name, comment) => {
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gameSlug, name, comment }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Could not post comment.");
    }
    return Array.isArray(payload.comments) ? payload.comments : [];
  };

  const formatDate = (value) => {
    try {
      return value ? new Date(value).toLocaleDateString() : "";
    } catch {
      return "";
    }
  };

  const render = (comments) => {
    list.replaceChildren();
    if (count) {
      count.textContent = comments.length === 1 ? "1 comment" : `${comments.length} comments`;
    }

    if (!comments.length) {
      const empty = document.createElement("p");
      empty.className = "comment-empty";
      empty.textContent = "No comments yet. Add the first player note.";
      list.append(empty);
      return;
    }

    comments.forEach((comment) => {
      const item = document.createElement("article");
      item.className = "comment-item";

      const meta = document.createElement("div");
      meta.className = "comment-meta";

      const name = document.createElement("strong");
      name.textContent = comment.name || "Player";

      const time = document.createElement("time");
      time.dateTime = comment.createdAt || "";
      time.textContent = formatDate(comment.createdAt);

      const text = document.createElement("p");
      text.textContent = comment.body || "";

      meta.append(name, time);
      item.append(meta, text);
      list.append(item);
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "Player").trim().slice(0, 40) || "Player";
    const text = String(data.get("comment") || "").trim().slice(0, 600);
    if (!text) {
      setStatus("Write a comment before posting.", "error");
      return;
    }

    setLoading(true);
    setStatus("Posting...");
    postComment(name, text)
      .then((comments) => {
        form.reset();
        render(comments);
        setStatus("Posted. Thanks for the note.", "success");
      })
      .catch((error) => {
        setStatus(error.message || "Could not post comment.", "error");
      })
      .finally(() => {
        setLoading(false);
      });
  });

  fetchComments()
    .then((comments) => {
      render(comments);
      setStatus("");
    })
    .catch((error) => {
      render([]);
      setStatus(error.message || "Comments are temporarily unavailable.", "error");
    });
  });
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("The site API is unavailable on this server. Start the site with Wrangler Pages dev.");
  }
  return response.json();
}

function hasLifetimeAccess() {
  return Boolean(readStoredAccess()?.unlocked);
}

function readStoredAccess() {
  try {
    const value = localStorage.getItem(paywallStorageKey());
    if (!value) return null;
    if (value === "true") return { unlocked: true, licenseKey: "" };
    const payload = JSON.parse(value);
    return payload && payload.unlocked ? payload : null;
  } catch {
    return null;
  }
}

function storeLifetimeAccess(licenseKey) {
  try {
    localStorage.setItem(paywallStorageKey(), JSON.stringify({
      unlocked: true,
      licenseKey,
      unlockedAt: new Date().toISOString(),
    }));
  } catch {
    localStorage.setItem(paywallStorageKey(), "true");
  }
}

function paywallStorageKey() {
  return paywallConfig.storageKey || "ggb_lifetime_access";
}

function applyAccessState(isUnlocked) {
  paywallPages.forEach((page) => {
    page.classList.toggle("paywall-locked", !isUnlocked);
    page.classList.toggle("paywall-unlocked", isUnlocked);
  });

  memberStatusPanels.forEach((panel) => {
    const copy = panel.querySelector("[data-member-status-copy]");
    const lockButton = panel.querySelector("[data-lock-access]");
    if (copy) {
      copy.textContent = isUnlocked
        ? "Lifetime access is active on this browser. The full walkthrough is visible."
        : "Use the payment card above to get the full walkthrough library. Returning buyers can use the receipt key under Already purchased.";
    }
    if (lockButton) {
      lockButton.hidden = !isUnlocked;
    }
  });

  if (isUnlocked) {
    loadPremiumContent();
  }
}

function setLicenseStatus(status, message, tone = "") {
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function initAccessPage(page) {
  const params = new URLSearchParams(window.location.search);
  const form = page.querySelector("[data-access-form]");
  const input = form?.querySelector("input[name='licenseCode']");
  const status = page.querySelector("[data-access-status]");
  const nextLink = page.querySelector("[data-access-next-link]");
  const nextPath = safeNextPath(params.get("next")) || "/games/loopit-just-like-the-ads/";
  const incomingKey = String(params.get("license_key") || params.get("licenseKey") || params.get("key") || "").trim();

  if (nextLink) {
    nextLink.setAttribute("href", nextPath);
  }

  if (hasLifetimeAccess()) {
    setLicenseStatus(status, "Access is already active on this browser.", "success");
  } else {
    setLicenseStatus(status, "Paste the license key shown on your Lemon Squeezy order page.", "");
  }

  if (incomingKey && input) {
    input.value = incomingKey;
    activateLicenseKey(incomingKey, status, nextPath, { cleanUrl: true, redirect: true });
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = String(input?.value || "").trim();
    if (!value) {
      setLicenseStatus(status, "Paste your license key first.", "error");
      return;
    }
    await activateLicenseKey(value, status, nextPath, { cleanUrl: false, redirect: true });
  });
}

async function activateLicenseKey(value, status, nextPath, options = {}) {
  const gameSlug = /^\/games\/([a-z0-9-]+)\/?$/.exec(nextPath)?.[1] || "";
  trackFunnelEvent("license_attempt", { pageType: "access", gameSlug });
  setLicenseStatus(status, "Checking access key...");
  const result = await validateAccess(value);
  if (!result.ok) {
    trackFunnelEvent("license_failure", { pageType: "access", gameSlug });
    setLicenseStatus(status, result.error || "That access key did not unlock guides.", "error");
    return false;
  }

  trackFunnelEvent("license_success", { pageType: "access", gameSlug });
  storeLifetimeAccess(value);
  setLicenseStatus(status, `${result.message || "Access activated."} Redirecting to guides...`, "success");
  if (options.cleanUrl) {
    window.history.replaceState({}, "", window.location.pathname);
  }
  if (options.redirect) {
    window.setTimeout(() => {
      window.location.assign(nextPath);
    }, 900);
  }
  return true;
}

function trackFunnelEvent(eventName, details) {
  window.GGBFunnel?.track(eventName, details);
}

function safeNextPath(value) {
  const next = String(value || "").trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "";
  return next;
}

async function validateAccess(value) {
  const licenseResult = await validateLicenseKey(value);
  if (licenseResult.ok) {
    return {
      ok: true,
      message: licenseResult.customerEmail
        ? `Unlocked for ${licenseResult.customerEmail}.`
        : "License verified. Full access is active on this browser.",
    };
  }

  const isFounderCode = await validateFounderCode(value);
  if (isFounderCode) {
    return { ok: true, message: "Founder access unlocked on this browser." };
  }

  return {
    ok: false,
    error: licenseResult.error || "That license key did not unlock access.",
  };
}

async function validateLicenseKey(value) {
  try {
    const response = await fetch("/api/license", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ licenseKey: value }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error || "License validation failed." };
    }
    return {
      ok: true,
      customerEmail: payload.license?.customerEmail || "",
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "License validation is temporarily unavailable.",
    };
  }
}

async function validateFounderCode(value) {
  const hashes = Array.isArray(paywallConfig.accessCodeHashes) ? paywallConfig.accessCodeHashes : [];
  if (!hashes.length) return false;
  const hash = await sha256(value);
  return hashes.includes(hash);
}

async function loadPremiumContent() {
  const access = readStoredAccess();
  if (!access?.licenseKey) return;

  const containers = Array.from(document.querySelectorAll("[data-premium-content][data-guide-slug]"));
  await Promise.all(containers.map(async (container) => {
    if (container.dataset.loaded === "true" || container.dataset.loading === "true") return;
    container.dataset.loading = "true";
    const gameSlug = container.dataset.guideSlug || "";
    try {
      const response = await fetch("/api/premium", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gameSlug, licenseKey: access.licenseKey }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not load premium content.");
      }
      container.innerHTML = payload.html || "";
      container.dataset.loaded = "true";
      initCommentSections(container);
    } catch (error) {
      container.innerHTML = `<section class="guide-section"><h2>Could not load premium content</h2><p>${escapeHtml(error.message || "Try entering your license key again.")}</p></section>`;
    } finally {
      container.dataset.loading = "false";
    }
  }));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sha256(value) {
  const input = new TextEncoder().encode(value.trim());
  const buffer = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
