const mongoose = require("mongoose");

const sendError = (res, { status, title, message }) => {
  if (res.headersSent) return;
  res.status(status).send(`<html><body style="background:#0f1117;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="background:#191d27;border:1px solid #2c3354;border-left:4px solid #ef4444;border-radius:12px;padding:2.5rem 3rem;max-width:520px"><div style="font-size:3rem;font-weight:900;color:#ef4444">${status}</div><h1 style="font-size:1.25rem;margin:0 0 0.75rem">${title}</h1><p style="color:#8892a4;font-size:0.875rem">${message}</p><a href="/" style="background:#6366f1;color:#fff;padding:0.55rem 1.5rem;border-radius:6px;text-decoration:none;font-size:0.875rem">← Back to Dashboard</a></div></body></html>`);
};

const errorHandler = (err, req, res, next) => {
  console.error(`❌ [${new Date().toISOString()}] ${req.method} ${req.url} — ${err.message}`);

  if (err instanceof mongoose.Error.ValidationError) {
    return sendError(res, { status: 422, title: "Validation Error", message: Object.values(err.errors).map(e => e.message).join(", ") });
  }
  if (err instanceof mongoose.Error.CastError) {
    return sendError(res, { status: 400, title: "Invalid ID", message: `"${err.value}" is not a valid product ID.` });
  }
  if (err.code === 11000) {
    return sendError(res, { status: 409, title: "Duplicate Entry", message: "A record with this value already exists." });
  }
  if (err.isAxiosError) {
    return sendError(res, { status: 502, title: "External Service Error", message: "Currency API is unavailable. Core features still work." });
  }

  sendError(res, {
    status: err.status || 500,
    title: err.title || "Server Error",
    message: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : err.message,
  });
};

const notFoundHandler = (req, res) => {
  sendError(res, { status: 404, title: "Page Not Found", message: `The page "${req.path}" doesn't exist.` });
};

module.exports = { errorHandler, notFoundHandler };