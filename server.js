require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const CONTACT_LOG_DIR = path.join(__dirname, "submissions");
const CONTACT_LOG_FILE = path.join(
  CONTACT_LOG_DIR,
  "contact-submissions.jsonl",
);
const LOCAL_DEV_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const origin = req.get("origin") || "";
  const isContactApiRequest = req.path === "/api/contact";
  const isLocalPreviewOrigin =
    origin === "null" || LOCAL_DEV_ORIGIN_REGEX.test(origin);

  if (isContactApiRequest && isLocalPreviewOrigin) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin === "null" ? "*" : origin,
    );
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  }

  if (isContactApiRequest && req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.static(__dirname));

let cachedTransporter = null;

function isPlaceholderEnvValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;

  const placeholderValues = new Set([
    "your-smtp-username",
    "your-smtp-password",
    "changeme",
  ]);

  return placeholderValues.has(normalized);
}

function getMissingEnvVars() {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "MAIL_TO",
  ];
  return required.filter((key) => isPlaceholderEnvValue(process.env[key]));
}

function hasResendApiKey() {
  return !isPlaceholderEnvValue(process.env.RESEND_API_KEY);
}

function getMissingResendEnvVars() {
  return ["MAIL_TO", "MAIL_FROM"].filter((key) =>
    isPlaceholderEnvValue(process.env[key]),
  );
}

async function sendWithResend({ to, from, replyTo, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [to],
      from,
      reply_to: replyTo,
      subject,
      text,
      html,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.message || `Resend API request failed (${response.status}).`,
    );
  }

  return result;
}

function getSmtpTransportConfig() {
  const port = Number(process.env.SMTP_PORT) || 587;

  const secure =
    String(process.env.SMTP_SECURE || "")
      .trim()
      .toLowerCase() === "true";

  console.log("SMTP CONFIG:", {
    host: process.env.SMTP_HOST,
    port,
    secure,
    user: process.env.SMTP_USER,
  });

  return { port, secure };
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const missingVars = getMissingEnvVars();
  if (missingVars.length) {
    throw new Error(`Missing env vars: ${missingVars.join(", ")}`);
  }

  const { port, secure } = getSmtpTransportConfig();

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function storeSubmissionLocally({ name, email, message, source }, req) {
  const record = {
    submittedAt: new Date().toISOString(),
    name,
    email,
    message,
    source,
    ip: req.ip,
    userAgent: req.get("user-agent") || "",
  };

  await fs.mkdir(CONTACT_LOG_DIR, { recursive: true });
  await fs.appendFile(CONTACT_LOG_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

app.post("/api/contact", async (req, res) => {
  try {
    const name = sanitizeText(req.body?.name);
    const email = sanitizeText(req.body?.email);
    const message = sanitizeText(req.body?.message);
    const source = sanitizeText(req.body?.source || "portfolio-contact-form");
    const honey = sanitizeText(req.body?.honey || req.body?._honey);

    // Silently ignore bots that fill hidden trap field.
    if (honey) {
      return res.status(200).json({ ok: true });
    }

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ ok: false, error: "All fields are required." });
    }

    if (!isValidEmail(email)) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid email address." });
    }

    if (message.length < 10) {
      return res.status(400).json({
        ok: false,
        error: "Message is too short (minimum 10 characters).",
      });
    }

    const useResend = hasResendApiKey();
    const missingVars = getMissingEnvVars();
    const missingResendVars = getMissingResendEnvVars();

    if (useResend && missingResendVars.length) {
      return res.status(500).json({
        ok: false,
        error: `Resend email settings are incomplete: ${missingResendVars.join(", ")}.`,
      });
    }

    if (!useResend && missingVars.length) {
      await storeSubmissionLocally({ name, email, message, source }, req);

      return res.status(202).json({
        ok: true,
        stored: true,
        message:
          "Transmission saved. Email relay is not configured yet, so check submissions/contact-submissions.jsonl.",
      });
    }

    const toAddress = process.env.MAIL_TO;
    const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER;

    const formattedDate = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const subject = `⚡ NEW_TRANSMISSION // ${name}`;
    const plainText = [
      "● SYSTEM STATUS: NEW INQUIRY",
      "",
      "YOU'VE GOT A LEAD",
      "Someone just hit up your portfolio. Don't leave them hanging.",
      "",
      `NAME:      ${name}`,
      `EMAIL:     ${email}`,
      `RECEIVED:  ${formattedDate}`,
      "",
      "MESSAGE:",
      message,
    ].join("\n");

    // The light design remains the fallback. Clients that expose a colour-scheme
    // preference render the terminal treatment when their UI is in dark mode.
    const htmlBody = `
<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      table { border-collapse:collapse; }
      @media screen and (max-width:600px) {
        .email-shell { padding:16px 8px !important; }
        .email-card { width:100% !important; max-width:100% !important; box-shadow:3px 3px 0 #000000 !important; }
        .content-pad { padding-left:16px !important; padding-right:16px !important; }
        .title { font-size:23px !important; line-height:28px !important; }
        .title svg { width:18px !important; height:18px !important; }
        .body-copy { font-size:15px !important; line-height:22px !important; }
        .field-label { width:76px !important; font-size:11px !important; }
        .field-value { padding-left:8px !important; font-size:14px !important; }
        .message-box { padding:14px !important; box-shadow:3px 3px 0 #000000 !important; }
        .button-table, .button-link { width:100% !important; }
        .button-link { box-sizing:border-box !important; text-align:center !important; }
      }
      @media (prefers-color-scheme: dark) {
        .page-bg { background-color:#0D0D0D !important; }
        .email-card { background-color:#121212 !important; border-color:#33FF57 !important; box-shadow:none !important; }
        .status-badge { background-color:#000000 !important; color:#33FF57 !important; }
        .status-dot, .terminal-green { color:#33FF57 !important; }
        .title, .body-copy, .field-value, .field-value a, .footer { color:#F2F2F2 !important; }
        .subtle-copy { color:#999999 !important; }
        .field-table, .footer { border-color:#2A2A2A !important; }
        .message-box { background-color:#1A2E1F !important; border-color:#33FF57 !important; box-shadow:none !important; }
        .button-cell { background-color:#22C55E !important; border-color:#33FF57 !important; box-shadow:none !important; }
        .button-link { color:#0D0D0D !important; }
      }
      [data-ogsc] .page-bg { background-color:#0D0D0D !important; }
      [data-ogsc] .email-card { background-color:#121212 !important; border-color:#33FF57 !important; box-shadow:none !important; }
      [data-ogsc] .status-badge { background-color:#000000 !important; color:#33FF57 !important; }
      [data-ogsc] .title, [data-ogsc] .body-copy, [data-ogsc] .field-value, [data-ogsc] .field-value a, [data-ogsc] .footer { color:#F2F2F2 !important; }
      [data-ogsc] .message-box { background-color:#1A2E1F !important; border-color:#33FF57 !important; box-shadow:none !important; }
      [data-ogsc] .button-cell { background-color:#22C55E !important; border-color:#33FF57 !important; box-shadow:none !important; }
    </style>
  </head>
  <body class="page-bg" style="margin:0; padding:0; background-color:#F5F1E8;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">New project inquiry received via your portfolio contact form.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="page-bg" style="width:100%; background-color:#F5F1E8; margin:0; padding:0;">
      <tr><td align="center" class="email-shell" style="padding:24px 12px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" class="email-card" style="width:100%; max-width:640px; background-color:#FFFFFF; border:3px solid #000000; border-radius:2px; box-shadow:6px 6px 0 #000000;">
          <tr><td class="content-pad" style="padding:24px 20px 10px;">
            <!--[if mso]>
            <v:roundrect arcsize="50%" fillcolor="#000000" strokecolor="#000000" style="height:32px; v-text-anchor:middle; width:235px;">
              <v:textbox inset="0,0,0,0">
                <div style="font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-size:12px; line-height:32px; font-weight:bold; text-align:center; white-space:nowrap;"><span style="color:#2DCC70;">●</span>&nbsp; SYSTEM STATUS: NEW INQUIRY</div>
              </v:textbox>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;"><tr><td class="status-badge" style="padding:7px 10px; background-color:#000000; border-radius:999px; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-size:12px; line-height:16px; font-weight:bold; white-space:nowrap;"><span class="status-dot" style="color:#2DCC70;">●</span>&nbsp; SYSTEM STATUS: NEW INQUIRY</td></tr></table>
            <!--<![endif]-->
            <h1 class="title" style="margin:20px 0 8px; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:28px; line-height:32px; font-weight:900; letter-spacing:0.2px;">YOU'VE GOT A<span style="white-space:nowrap;">&nbsp;LEAD&nbsp;<svg width="24" height="24" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle; margin-left:2px;" xmlns="http://www.w3.org/2000/svg"><path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c1 1 2 2.5 2 4.5A6 6 0 0 1 4 13.5C4 8 8 6 8 3c1.5 1 2 2 2 3.5C10.5 5 11.5 3.5 12 2z" fill="#FF6B00"/></svg></span></h1>
            <p class="body-copy subtle-copy" style="margin:0; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:16px; line-height:23px;">Someone just hit up your portfolio. Don't leave them hanging.</p>
          </td></tr>
          <tr><td class="content-pad" style="padding:16px 20px 20px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="field-table" style="width:100%; border-top:1px solid #000000; border-bottom:1px solid #000000;">
            <tr><td class="field-label" style="width:104px; padding:14px 0 7px; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:13px; line-height:20px; font-weight:bold; vertical-align:top; white-space:nowrap;">NAME</td><td class="field-value" style="padding:14px 0 7px 12px; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:15px; line-height:20px; word-break:break-word;">${escapeHtml(name)}</td></tr>
            <tr><td class="field-label" style="width:104px; padding:7px 0; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:13px; line-height:20px; font-weight:bold; vertical-align:top; white-space:nowrap;">EMAIL</td><td class="field-value" style="padding:7px 0 7px 12px; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:15px; line-height:20px; word-break:break-word;"><a href="mailto:${escapeHtml(email)}" style="color:#000000; text-decoration:underline;">${escapeHtml(email)}</a></td></tr>
            <tr><td class="field-label" style="width:104px; padding:7px 0 14px; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:13px; line-height:20px; font-weight:bold; vertical-align:top; white-space:nowrap;">RECEIVED</td><td class="field-value" style="padding:7px 0 14px 12px; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:15px; line-height:20px; word-break:break-word;">${escapeHtml(formattedDate)}</td></tr>
          </table></td></tr>
          <tr><td class="content-pad" style="padding:0 20px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td class="message-box" style="padding:16px; background-color:#FFE81A; border:2px solid #000000; box-shadow:4px 4px 0 #000000;"><p class="terminal-green" style="margin:0 0 8px; font-family:'Courier New', Courier, monospace; color:#000000; font-size:13px; line-height:18px; font-weight:bold;">MESSAGE:</p><p class="body-copy" style="margin:0; font-family:Arial, Helvetica, sans-serif; color:#000000; font-size:16px; line-height:24px; word-break:break-word;">${escapeHtml(message).replace(/\n/g, "<br>")}</p></td></tr></table></td></tr>
          <tr><td class="content-pad" style="padding:0 20px 28px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" class="button-table"><tr><td class="button-cell" style="background-color:#000000; border:2px solid #000000; box-shadow:4px 4px 0 #000000;"><a href="mailto:${escapeHtml(email)}" class="button-link" style="display:inline-block; padding:14px 18px; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-size:14px; line-height:18px; font-weight:800; letter-spacing:0.2px; text-decoration:none;">REPLY TO VISITOR →</a></td></tr></table></td></tr>
          <tr><td class="content-pad footer" style="padding:14px 20px; border-top:1px solid #000000; font-family:'Courier New', Courier, monospace; color:#000000; font-size:11px; line-height:16px;">RAVINDRA.exe // AUTO-GENERATED TRANSMISSION</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    const mailOptions = {
      to: toAddress,
      from: fromAddress,
      replyTo: email,
      subject,
      text: plainText,
      html: htmlBody,
    };

    try {
      if (useResend) {
        console.log("Sending mail with Resend...");
        const info = await sendWithResend(mailOptions);
        console.log("Mail sent with Resend:", info);
      } else {
        const transporter = getTransporter();
        console.log("Sending mail with SMTP...");
        const info = await transporter.sendMail(mailOptions);
        console.log("Mail sent with SMTP:", info);
      }

      return res
        .status(200)
        .json({ ok: true, message: "Message sent successfully." });
    } catch (error) {
      console.error("SEND MAIL ERROR:");
      console.error(error);

      return res.status(500).json({
        ok: false,
        error: error.message || "Unable to send your message right now.",
      });
    }
  } catch (error) {
    console.error("Contact API error:", error);

    if (String(error.message || "").startsWith("Missing env vars:")) {
      return res.status(500).json({
        ok: false,
        error:
          "Server email settings are incomplete. Check environment variables.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Unable to send your message right now. Please try again later.",
    });
  }
});

app.get("/health", (_req, res) => {
  const useResend = hasResendApiKey();
  const missingVars = useResend
    ? getMissingResendEnvVars()
    : getMissingEnvVars();
  res.status(200).json({
    ok: missingVars.length === 0,
    deliveryProvider: useResend ? "resend" : "smtp",
    missingEnv: missingVars,
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`NeoBrutalist server running on port ${PORT}`);

  const missingVars = getMissingEnvVars();
  if (missingVars.length) {
    console.warn(`Warning: missing env vars -> ${missingVars.join(", ")}`);
  }
});
