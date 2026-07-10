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

  if (isContactApiRequest && LOCAL_DEV_ORIGIN_REGEX.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
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

    const missingVars = getMissingEnvVars();
    if (missingVars.length) {
      await storeSubmissionLocally({ name, email, message, source }, req);

      return res.status(202).json({
        ok: true,
        stored: true,
        message:
          "Transmission saved. Email relay is not configured yet, so check submissions/contact-submissions.jsonl.",
      });
    }

    const transporter = getTransporter();
    console.log("Transporter created successfully");
    
    const toAddress = process.env.MAIL_TO;
    const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER;


    const subject = `New portfolio inquiry from ${name}`;
    const plainText = [
      "New contact form submission",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "Message:",
      message,
    ].join("\n");

    const htmlBody = `
            <h2>New contact form submission</h2>
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        `;

    await transporter.sendMail({
      to: toAddress,
      from: fromAddress,
      replyTo: email,
      subject,
      text: plainText,
      html: htmlBody,
    });

    return res
      .status(200)
      .json({ ok: true, message: "Message sent successfully." });
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
  const missingVars = getMissingEnvVars();
  res.status(200).json({
    ok: missingVars.length === 0,
    missingEnv: missingVars,
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`NeoBrutalist server running on http://localhost:${PORT}`);

  const missingVars = getMissingEnvVars();
  if (missingVars.length) {
    console.warn(`Warning: missing env vars -> ${missingVars.join(", ")}`);
  }
});
