/**
 * /public/js/main.js
 * Lightweight client-side helpers:
 *  - confirmDelete()  — prevents accidental deletes
 *  - showToast()      — transient success notifications
 *  - Real-time form character counter for product_name
 */

"use strict";

/* ── Delete confirmation ─────────────────────────────────────────────────── */
function confirmDelete(event, productName) {
  const name = productName || "this product";
  const confirmed = window.confirm(
    `Are you sure you want to permanently delete "${name}"?\n\nThis action cannot be undone.`
  );
  if (!confirmed) {
    event.preventDefault();
    return false;
  }
  return true;
}

/* ── Toast notification ──────────────────────────────────────────────────── */
function showToast(message, duration = 3500) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = "✓  " + message;
  toast.classList.remove("toast--hidden");

  setTimeout(() => {
    toast.classList.add("toast--hidden");
  }, duration);
}

/* ── Client-side form validation (progressive enhancement) ──────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* Character counter for product_name */
  const nameInput = document.getElementById("product_name");
  if (nameInput) {
    const hint = nameInput.nextElementSibling; // .form__hint
    const updateCounter = () => {
      const len = nameInput.value.length;
      if (hint) hint.textContent = `${len}/120 characters.`;
      nameInput.style.borderColor = len > 120 ? "var(--col-red)" : "";
    };
    nameInput.addEventListener("input", updateCounter);
    updateCounter(); // initialise on load (edit page pre-fill)
  }

  /* Prevent double-submit on the product form */
  const form = document.getElementById("productForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled   = true;
        submitBtn.textContent = "Saving…";
      }
    });
  }

  /* Auto-dismiss any server-rendered alert after 8 s */
  const alert = document.querySelector(".alert--error");
  if (alert) {
    setTimeout(() => {
      alert.style.transition = "opacity 0.5s ease";
      alert.style.opacity    = "0";
      setTimeout(() => alert.remove(), 500);
    }, 8000);
  }

  /* Highlight active nav item (simple path match) */
  const path = window.location.pathname;
  document.querySelectorAll(".topbar a").forEach((link) => {
    if (link.getAttribute("href") === path) {
      link.style.color = "var(--col-indigo-h)";
    }
  });
});
