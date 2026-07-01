const searchInput = document.querySelector("#guide-search");
const clearButton = document.querySelector("[data-clear-search]");
const cards = Array.from(document.querySelectorAll("[data-guide-card]"));

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

document.querySelectorAll("[data-comment-section]").forEach((section) => {
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

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Comments API is unavailable on this local server. Start the site with Wrangler Pages dev.");
  }
  return response.json();
}
