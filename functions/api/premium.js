import { premiumContentBySlug } from "../_generated/premium-content.js";

const LEMON_LICENSE_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const DEFAULT_PRODUCT_ID = "1189903";
const FOUNDER_ACCESS_HASH = "c7174ca53eecb87b1510259f7192ef7c2e0d6aa7bc5c8ba234ca6a3cdc587866";
const MAX_LICENSE_LENGTH = 120;
const MAX_SLUG_LENGTH = 100;

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const gameSlug = normalizeSlug(payload.gameSlug);
  const licenseKey = normalizeLicenseKey(payload.licenseKey || payload.license_key);
  if (!gameSlug || !premiumContentBySlug[gameSlug]) {
    return json({ ok: false, error: "Premium guide not found." }, 404);
  }

  if (!licenseKey) {
    return json({ ok: false, error: "Enter a license key." }, 400);
  }

  const isFounderCode = await matchesFounderCode(licenseKey);
  if (!isFounderCode) {
    const result = await validateWithLemonSqueezy(licenseKey);
    if (!result.valid) {
      return json({ ok: false, error: result.error || "This license key is not valid." }, 401);
    }

    const allowedProductId = String(env.LEMONSQUEEZY_PRODUCT_ID || DEFAULT_PRODUCT_ID);
    const productId = String(result.meta?.product_id || "");
    if (productId !== allowedProductId) {
      return json({ ok: false, error: "This license key is for a different product." }, 403);
    }
  }

  return json({
    ok: true,
    html: premiumContentBySlug[gameSlug],
  });
}

function normalizeLicenseKey(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, MAX_LICENSE_LENGTH);
}

function normalizeSlug(value) {
  return String(value || "")
    .replace(/[^a-z0-9-]/g, "")
    .trim()
    .slice(0, MAX_SLUG_LENGTH);
}

async function matchesFounderCode(value) {
  const input = new TextEncoder().encode(value.trim());
  const buffer = await crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return hash === FOUNDER_ACCESS_HASH;
}

async function validateWithLemonSqueezy(licenseKey) {
  const body = new URLSearchParams();
  body.set("license_key", licenseKey);

  let response;
  try {
    response = await fetch(LEMON_LICENSE_VALIDATE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    return { valid: false, error: "License validation is temporarily unavailable." };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { valid: false, error: "License validation returned an unreadable response." };
  }

  if (!response.ok) {
    return { valid: false, error: payload.error || "License validation failed." };
  }

  return payload;
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
