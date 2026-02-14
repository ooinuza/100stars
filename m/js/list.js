import { loadData } from "./storage.js";
import { rootCategoryOf } from "./state.js";

const tbody = document.getElementById("tbody");
const countText = document.getElementById("countText");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const tableWrap = document.getElementById("tableWrap");

let data = loadData();
let items = [];

boot();

function boot(){
  if (!data || !Array.isArray(data.nodes)){
    items = [];
  } else {
    // listにはカテゴリとMeを除いた星だけ出す（好みなら変えられる）
    items = data.nodes.filter(n => !n.isMe && !n.isCategory);
  }
  bind();
  render();
}

function bind(){
  searchInput.addEventListener("input", render);
  sortSelect.addEventListener("change", render);
  exportCsvBtn.addEventListener("click", exportCsv);

  // スクロールできない問題対策：wrapにフォーカスが当たるとホイール無効になる環境があるので保険
  tableWrap.addEventListener("wheel", () => {}, { passive:true });
}

function render(){
  const q = (searchInput.value || "").trim().toLowerCase();
  const sort = sortSelect.value;

  let list = items;

  if (q){
    list = list.filter(n => {
      const hay = `${n.title||""} ${n.notes||""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  list = sortList(list, sort);

  const doneCount = list.filter(x => x.completed).length;
  countText.textContent = `${list.length} items  (${doneCount} done)`;
  tbody.innerHTML = list.map(n => rowHtml(n)).join("");
}

function sortList(list, sort){
  const out = [...list];

  const num = (x) => Number(x) || 0;
  const time = (iso) => {
    const d = new Date(iso || "");
    const t = d.getTime();
    return isNaN(t) ? 0 : t;
  };

  if (sort === "priority_desc"){
    out.sort((a,b) => num(b.priority) - num(a.priority));
  } else if (sort === "priority_asc"){
    out.sort((a,b) => num(a.priority) - num(b.priority));
  } else if (sort === "created_desc"){
    out.sort((a,b) => time(b.createdAt) - time(a.createdAt));
  } else if (sort === "created_asc"){
    out.sort((a,b) => time(a.createdAt) - time(b.createdAt));
  } else if (sort === "title_asc"){
    out.sort((a,b) => (a.title||"").localeCompare((b.title||""), "ja"));
  } else if (sort === "title_desc"){
    out.sort((a,b) => (b.title||"").localeCompare((a.title||""), "ja"));
  }

  return out;
}

function rowHtml(n){
  const cat = rootCategoryOf(data, n) || "";
  const pri = `★${n.priority || 1}`;
  const done = n.completed ? "✓" : "";
  const created = fmtDate(n.createdAt);

  return `
    <tr class="${n.completed ? "isDone" : ""}">
      <td>${esc(n.title||"")}</td>
      <td>${esc(cat)}</td>
      <td>${esc(pri)}</td>
      <td class="doneCell" title="${n.completed ? "Completed" : ""}">${done}</td>
      <td>${esc(n.notes||"")}</td>
      <td>${esc(created)}</td>
    </tr>
  `;
}

function fmtDate(iso){
  const d = new Date(iso || "");
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function esc(s){
  return (s||"").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/* ===== CSV Export ===== */
function exportCsv(){
  const header = ["title","category","priority","completed","notes","createdAt","updatedAt"];
  const lines = [header.join(",")];

  for (const n of items){
    const cat = rootCategoryOf(data, n) || "";
    lines.push([
      csv(n.title),
      csv(cat),
      csv(n.priority ?? 1),
      csv(n.completed ? "TRUE" : "FALSE"),
      csv(n.notes ?? ""),
      csv(n.createdAt ?? ""),
      csv(n.updatedAt ?? ""),
    ].join(","));
  }

  download("100stars_list.csv", lines.join("\n"), "text/csv");
}

function csv(v){
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function download(filename, text, mime){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}