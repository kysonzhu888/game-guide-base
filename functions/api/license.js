const LEMON_LICENSE_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const DEFAULT_PRODUCT_ID = "1189903";
const MAX_LICENSE_LENGTH = 120;

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const licenseKey = normalizeLicenseKey(payload.licenseKey || payload.license_key);
  if (!licenseKey) {
    return json({ ok: false, error: "Enter a license key." }, 400);
  }

  const result = await validateWithLemonSqueezy(licenseKey);
  if (!result.valid) {
    return json({ ok: false, error: result.error || "This license key is not valid." }, 401);
  }

  const allowedProductId = String(env.LEMONSQUEEZY_PRODUCT_ID || DEFAULT_PRODUCT_ID);
  const productId = String(result.meta?.product_id || "");
  if (productId !== allowedProductId) {
    return json({ ok: false, error: "This license key is for a different product." }, 403);
  }

  return json({
    ok: true,
    license: {
      status: result.license_key?.status || "valid",
      productName: result.meta?.product_name || "Game Guide Base Lifetime",
      customerEmail: result.meta?.customer_email || "",
    },
  });
}

function normalizeLicenseKey(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, MAX_LICENSE_LENGTH);
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
