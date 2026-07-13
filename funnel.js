(() => {
  const FUNNEL_ENDPOINT = "/api/funnel";
  const FUNNEL_EVENT_NAMES = new Set([
    "checkout_click",
    "access_view",
    "license_attempt",
    "license_success",
    "license_failure",
  ]);

  function track(eventName, details = {}) {
    if (!FUNNEL_EVENT_NAMES.has(eventName)) return false;

    const payload = JSON.stringify({
      eventName,
      pageType: details.pageType || currentPageType(),
      gameSlug: details.gameSlug || currentGameSlug(),
    });

    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(
        FUNNEL_ENDPOINT,
        new Blob([payload], { type: "text/plain" }),
      );
      if (accepted) return true;
    }

    fetch(FUNNEL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
    return true;
  }

  function currentPageType() {
    if (document.querySelector("[data-access-page]")) return "access";
    if (document.querySelector("[data-comment-section]")) return "guide";
    return "home";
  }

  function currentGameSlug() {
    const section = document.querySelector("[data-comment-section][data-game-slug]");
    if (section?.dataset.gameSlug) return section.dataset.gameSlug;

    const next = new URLSearchParams(window.location.search).get("next") || "";
    const match = /^\/games\/([a-z0-9-]+)\/?$/.exec(next);
    return match?.[1] || "";
  }

  window.GGBFunnel = Object.freeze({ track });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-funnel-event]");
    if (!target) return;
    track(target.dataset.funnelEvent, {
      pageType: target.dataset.funnelPageType,
      gameSlug: target.dataset.funnelGameSlug,
    });
  });

  if (document.querySelector("[data-access-page]")) {
    track("access_view", { pageType: "access" });
  }
})();
