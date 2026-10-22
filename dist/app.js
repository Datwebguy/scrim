import { createProof, evaluatePayment, formatMoney, proofStatus } from "./core.js";

const activities = [
  { direction: "out", who: "compute.near", detail: "Inference services", date: "Today · 09:42", amount: -120, state: "settled" },
  { direction: "in", who: "payroll.near", detail: "Treasury funding", date: "Yesterday · 16:18", amount: 8500, state: "settled" },
  { direction: "out", who: "storage.near", detail: "October storage", date: "Yesterday · 12:05", amount: -220, state: "settled" },
  { direction: "out", who: "vendor-07.near", detail: "Vendor invoice #1048", date: "Oct 20 · 18:31", amount: -500, state: "pending" },
  { direction: "in", who: "client-14.near", detail: "Project settlement", date: "Oct 20 · 11:24", amount: 3200, state: "settled" }
];

const policy = { approvedCounterparties: ["compute.near", "storage.near", "payroll.near"], perPaymentLimit: 500, dailyLimit: 2500, approvalThreshold: 400 };
let spentToday = 840;
const defaultProofs = [
  { id: "p-01", type: "balance", fact: "Balance is above $100,000", reader: "audit.near", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 22 * 60 * 60_000).toISOString(), status: "active" },
  { id: "p-02", type: "agent-limit", fact: "Operator One stayed within its daily cap", reader: "board.near", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(), status: "active" }
];
let proofs = JSON.parse(localStorage.getItem("scrim:proofs") || "null") || defaultProofs;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function activityMarkup(item) {
  return `<div class="activity-row" data-search="${item.who} ${item.detail}"><span class="activity-symbol">${item.direction === "in" ? "↓" : "↗"}</span><span class="who"><strong>${item.who}</strong><small>${item.detail}</small></span><small>${item.date}</small><span class="amount">${item.amount > 0 ? "+" : "−"}${formatMoney(Math.abs(item.amount))}</span><span class="state ${item.state}">${item.state}</span></div>`;
}

function renderActivities() {
  $("#activity-list").innerHTML = activities.slice(0, 4).map(activityMarkup).join("");
  $("#payment-table").innerHTML = activities.map(activityMarkup).join("");
}

function remainingTime(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.ceil(ms / 3_600_000);
  return hours < 24 ? `${hours}h remaining` : `${Math.ceil(hours / 24)}d remaining`;
}

function renderProofs() {
  const active = proofs.filter(p => proofStatus(p) === "active");
  $("#proof-count").textContent = active.length;
  $("#active-proof-count").textContent = active.length;
  $("#proof-list").innerHTML = proofs.map(p => `<div class="proof-row"><div><span class="proof-type">◇</span><span><strong>${p.fact}</strong><small>${p.type.replace("-", " ").toUpperCase()}</small></span></div><span><strong>${p.reader}</strong><small>NAMED READER</small></span><span><strong>${remainingTime(p.expiresAt)}</strong><small>${proofStatus(p).toUpperCase()}</small></span>${proofStatus(p) === "active" ? `<button class="revoke" data-revoke="${p.id}">Revoke</button>` : "<small>Closed</small>"}</div>`).join("");
  $$('[data-revoke]').forEach(button => button.addEventListener("click", () => {
    proofs = proofs.map(p => p.id === button.dataset.revoke ? { ...p, status: "revoked" } : p);
    localStorage.setItem("scrim:proofs", JSON.stringify(proofs)); renderProofs(); showToast("Proof revoked", "The reader can no longer verify this proof.");
  }));
}

function switchView(id) {
  $$(".view").forEach(v => v.classList.toggle("active", v.id === id));
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === id));
  $(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(title, message) {
  $("#toast-title").textContent = title; $("#toast-message").textContent = message;
  $(".toast").classList.add("show"); setTimeout(() => $(".toast").classList.remove("show"), 3200);
}

$$('[data-view]').forEach(link => link.addEventListener("click", event => { event.preventDefault(); switchView(link.dataset.view); history.replaceState(null, "", `#${link.dataset.view}`); }));
$$('[data-view-link]').forEach(button => button.addEventListener("click", () => switchView(button.dataset.viewLink)));
$$('[data-open]').forEach(button => button.addEventListener("click", () => $(`#${button.dataset.open}`).showModal()));
$(".mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));

$(".eye").addEventListener("click", event => {
  const hidden = $("#balance").dataset.hidden === "true";
  $("#balance").textContent = hidden ? "$ 124,860.42" : "$ •••,•••.••";
  $("#balance").dataset.hidden = String(!hidden); event.currentTarget.setAttribute("aria-label", hidden ? "Hide balance" : "Show balance");
});

const sendForm = $("#send-form");
function updatePolicyResult() {
  const data = new FormData(sendForm);
  const result = evaluatePayment(policy, { counterparty: data.get("counterparty"), amount: data.get("amount") }, spentToday);
  const box = $("#policy-result"); box.classList.toggle("blocked", !result.allowed);
  box.querySelector("span").textContent = result.allowed ? "✓" : "×";
  box.querySelector("strong").textContent = result.allowed ? (result.needsApproval ? "Approval required" : "Policy check passed") : "Policy check blocked";
  box.querySelector("small").textContent = result.reason;
  sendForm.querySelector('[type="submit"]').disabled = !result.allowed;
  return result;
}
sendForm.addEventListener("input", updatePolicyResult);
sendForm.addEventListener("submit", event => {
  event.preventDefault(); const data = new FormData(sendForm); const result = updatePolicyResult(); if (!result.allowed) return;
  const amount = Number(data.get("amount")); activities.unshift({ direction: "out", who: data.get("counterparty"), detail: data.get("memo"), date: "Just now", amount: -amount, state: result.needsApproval ? "pending" : "prepared" });
  spentToday += result.needsApproval ? 0 : amount; renderActivities(); sendForm.closest("dialog").close(); showToast(result.needsApproval ? "Approval requested" : "Payment prepared", result.reason);
});

const proofForm = $("#proof-form");
proofForm.elements.expires.addEventListener("input", event => $("#expiry-output").textContent = `${event.target.value} minutes`);
proofForm.addEventListener("submit", event => {
  event.preventDefault(); const data = new FormData(proofForm);
  proofs.unshift(createProof({ type: data.get("type"), reader: data.get("reader"), expiresInMinutes: data.get("expires"), fact: data.get("fact") }));
  localStorage.setItem("scrim:proofs", JSON.stringify(proofs)); renderProofs(); proofForm.closest("dialog").close(); showToast("Proof created", `Only ${data.get("reader")} can read it.`);
});

$("#payment-search").addEventListener("input", event => { const term = event.target.value.toLowerCase(); $$("#payment-table .activity-row").forEach(row => row.hidden = !row.dataset.search.toLowerCase().includes(term)); });
$("#save-policy").addEventListener("click", () => showToast("Policy saved", "New constraints apply to future intents."));
$("#simulate-button").addEventListener("click", () => $("#send-dialog").showModal());
$$('.tag-list span button').forEach(button => button.addEventListener("click", () => button.parentElement.remove()));
$$('.chip').forEach(chip => chip.addEventListener("click", () => { $$('.chip').forEach(c => c.classList.remove("active")); chip.classList.add("active"); }));

renderActivities(); renderProofs();
const initialView = location.hash.slice(1); if (["overview", "payments", "proofs", "policies"].includes(initialView)) switchView(initialView);
