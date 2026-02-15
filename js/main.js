import { DEFAULT_CATEGORIES } from "./constants.js";
import { loadData, saveData, clearData } from "./storage.js";
import { makeId, nowISO, clamp, rand, deepClone, findNode, childrenOf } from "./state.js";

/* ===== DOM ===== */
const mapEl = document.getElementById("map");
const worldEl = document.getElementById("world");
const wiresEl = document.getElementById("wires");
const nodesEl = document.getElementById("nodes");

const resetBtn = document.getElementById("resetBtn");
const zoomSlider = document.getElementById("zoomSlider");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");

const titleInput = document.getElementById("titleInput");
const lockTitleInput = document.getElementById("lockTitleInput");
const notesInput = document.getElementById("notesInput");
const completedInput = document.getElementById("completedInput");
const parentSelect = document.getElementById("parentSelect");
const saveBtn = document.getElementById("saveBtn");
const addChildBtn = document.getElementById("addChildBtn");
const deleteBtn = document.getElementById("deleteBtn");
const toastEl = document.getElementById("toast");
const starBtns = [...document.querySelectorAll(".starBtn")];

/* ===== App data ===== */
let data = null;

/* ===== View state (pan/zoom) ===== */
let view = {
  scale: 0.80,   // default zoom-out
  ox: 0,
  oy: 0,
};

let selectedId = null;

/* ===== init ===== */
boot();

function boot(){
  const loaded = loadData();
  if (loaded && loaded.nodes && loaded.view) {
    data = loaded;
    view = { ...view, ...loaded.view };
  } else {
    data = makeDefaultData();
    saveAll("init");
  }


  // migration: ensure new fields exist
  for (const n of data.nodes){
    if (typeof n.completed !== "boolean") n.completed = false;
  }

  // sync UI
  zoomSlider.value = String(view.scale);

  // center-ish
  if (!loaded) {
    const r = mapEl.getBoundingClientRect();
    view.ox = r.width * 0.5;
    view.oy = r.height * 0.5;
    saveAll("init2");
  }

  bindEvents();
  render();
  // auto select Me
  const me = data.nodes.find(n => n.isMe);
  if (me) select(me.id);
}

function makeDefaultData(){
  const now = nowISO();
  const meId = makeId();

  const nodes = [];
  nodes.push({
    id: meId,
    title: "Me",
    notes: "",
    priority: 3,
    parentId: null,
    x: 0, y: 0,
    lockedTitle: true,
    completed: false,
    isMe: true,
    isCategory: false,
    createdAt: now,
    updatedAt: now,
  });

  // categories: random-ish around me (NOT uniform)
  for (const c of DEFAULT_CATEGORIES){
    const id = makeId();
    const ang = rand(0, Math.PI * 2);
    const radius = rand(180, 320);
    const jitter = rand(-70, 70);

    nodes.push({
      id,
      title: c,
      notes: "",
      priority: 1,
      parentId: meId,
      x: Math.cos(ang) * radius + rand(-jitter, jitter),
      y: Math.sin(ang) * radius + rand(-jitter, jitter),
      lockedTitle: true,     // ✅ category名を無意識に変えさせない
      completed: false,
      isMe: false,
      isCategory: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    nodes,
    view: { scale: 0.80, ox: 0, oy: 0 },
    updatedAt: now,
  };
}

function saveAll(reason){
  data.view = { ...view };
  data.updatedAt = nowISO();
  saveData(data);
}

/* ===== helpers ===== */
function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=>toastEl.classList.remove("show"), 1600);
}

function nodeClass(n){
  const p = clamp(Number(n.priority || 1), 1, 5);
  const cls = ["node", `p${p}`];
  if (n.isMe) cls.push("me");
  if (n.isCategory) cls.push("category"); // ← これだけ追加
  if (n.completed) cls.push("completed");
  if (n.id === selectedId) cls.push("selected");
  return cls.join(" ");
}

/* ===== rendering ===== */
function applyWorldTransform(){
  worldEl.style.transform = `translate(${view.ox}px, ${view.oy}px) scale(${view.scale})`;
}

function render(){
  applyWorldTransform();

  // nodes
  nodesEl.innerHTML = "";
  for (const n of data.nodes){
    const el = document.createElement("div");
    el.className = nodeClass(n);
    el.style.left = `${n.x}px`;
    el.style.top  = `${n.y}px`;
    el.dataset.id = n.id;

    el.innerHTML = `
      <div class="dot"></div>
      <div class="label">${escapeHtml(n.title || "")}</div>
    `;
    nodesEl.appendChild(el);
  }

  // wires
  renderWires();

  // panel
  renderPanel();
}

function renderWires(){
  wiresEl.innerHTML = "";
  // SVG viewBox big enough (we draw in world coords, then world is transformed)
  const w = mapEl.clientWidth;
  const h = mapEl.clientHeight;
  wiresEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  // But we actually draw in world coords; easiest: draw using <line> and rely on world transform
  // So we just use x/y as world coords.
  for (const child of data.nodes){
    if (!child.parentId) continue;
    const parent = findNode(data, child.parentId);
    if (!parent) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", parent.x);
    line.setAttribute("data-child", child.id);
    line.setAttribute("data-parent", parent.id);
    line.setAttribute("y1", parent.y);
    line.setAttribute("x2", child.x);
    line.setAttribute("y2", child.y);
    line.setAttribute("class", "wire");
    wiresEl.appendChild(line);
  }
}


function getAffectedWiresForNode(nodeId){
  // wires are created with data-child / data-parent in renderWires()
  return [...wiresEl.querySelectorAll(`line[data-child="${nodeId}"], line[data-parent="${nodeId}"]`)];
}

function updateWiresForNode(nodeId, lines){
  // Update only wires connected to nodeId (as parent or child).
  // NOTE: Do NOT reference `drag` here because `drag` is local inside bindEvents().
  const n = findNode(data, nodeId);
  if (!n) return;

  const targets = lines || getAffectedWiresForNode(nodeId);

  for (const line of targets){
    const childId = line.getAttribute("data-child");
    const parentId = line.getAttribute("data-parent");

    if (parentId === nodeId){
      // this node is parent: x1/y1
      line.setAttribute("x1", n.x);
      line.setAttribute("y1", n.y);
    }
    if (childId === nodeId){
      // this node is child: x2/y2
      line.setAttribute("x2", n.x);
      line.setAttribute("y2", n.y);
    }
  }
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/* ===== selection / panel ===== */
function select(id){
  selectedId = id;
  render();
}

function renderPanel(){
  const n = selectedId ? findNode(data, selectedId) : null;

  // parent options: Me + Categories (固定) + “その他の星”は選択しない方が混乱が少ない
  parentSelect.innerHTML = "";

  const me = data.nodes.find(x => x.isMe);
  const categories = data.nodes.filter(x => x.isCategory);

  const optGroupMe = document.createElement("optgroup");
  optGroupMe.label = "— Me —";
  if (me){
    const o = new Option(me.title, me.id);
    optGroupMe.appendChild(o);
  }
  parentSelect.appendChild(optGroupMe);

  const optGroupCat = document.createElement("optgroup");
  optGroupCat.label = "— Categories —";
  for (const c of categories){
    optGroupCat.appendChild(new Option(c.title, c.id));
  }
  parentSelect.appendChild(optGroupCat);

  if (!n){
    titleInput.value = "";
    notesInput.value = "";
    lockTitleInput.checked = false;
    completedInput.checked = false;
    completedInput.disabled = true;
    titleInput.disabled = false;
    parentSelect.value = me ? me.id : "";
    setPriorityUI(3);
    deleteBtn.disabled = true;
    addChildBtn.disabled = true;
    addChildBtn.textContent = "＋ Add child star";
    saveBtn.disabled = true;
    return;
  }

  titleInput.value = n.title || "";
  notesInput.value = n.notes || "";
  lockTitleInput.checked = !!n.lockedTitle;
  completedInput.checked = !!n.completed;
  completedInput.disabled = !!n.isMe || !!n.isCategory;

  // ✅ titleロック時は編集不可
  titleInput.disabled = !!n.lockedTitle;

  parentSelect.value = n.parentId || (me ? me.id : "");
  setPriorityUI(clamp(Number(n.priority||1),1,5));

  deleteBtn.disabled = !!n.isMe; // Meは消さない
  addChildBtn.disabled = false;
  addChildBtn.textContent = n.isMe ? "＋ Add category" : "＋ Add child star";
  saveBtn.disabled = false;
}

function setPriorityUI(v){
  starBtns.forEach(btn => {
    const n = Number(btn.dataset.v);
    btn.classList.toggle("active", n <= v);
  });
}

/* ===== interactions ===== */
function bindEvents(){
     // drag nodes (move) — ✅ hover暴発を止める版（threshold + 強制解除）
    const DRAG_THRESHOLD_PX = 3;
  
    let drag = {
      id: null,
      pointerId: null,
      startWorld: null,   // { px, py, nx, ny }
      startClient: null,  // { x, y }
      active: false,
      nodeEl: null,       // dragged DOM element (stable during drag)
      wireEls: null,      // affected <line> elements to update during drag
    };
  
    function endNodeDrag(commit){
      if (!drag.id) return;
      const releasedId = drag.id;
      const wasActive = drag.active;
  
      drag.id = null;
      drag.pointerId = null;
      drag.startWorld = null;
      drag.startClient = null;
      drag.active = false;
      drag.nodeEl = null;
      drag.wireEls = null;
  
      // ✅ クリック（ドラッグ未開始）の場合はここで選択を確定
      if (!wasActive) {
        select(releasedId);
        // click は保存しない
        return;
      }

      if (commit && wasActive) {
        saveAll("drag");
      }
  
      // 終了時に一度だけ再描画して、class/パネル/ワイヤー状態を同期
      if (wasActive) {
        render();
      }
    }
  
    nodesEl.addEventListener("pointerdown", (e) => {
      // 左クリック/主ボタンのみ
      if (e.button !== 0) return;
  
      const nodeEl = e.target.closest(".node");
      if (!nodeEl) return;
  
      const id = nodeEl.dataset.id;
      const n = findNode(data, id);
      if (!n) return;
  
      // ここでは「候補」だけ作る（まだドラッグ開始しない）
      drag.id = id;
      drag.pointerId = e.pointerId;
      drag.active = false;
      drag.startClient = { x: e.clientX, y: e.clientY };
  
      const p = screenToWorld(e.clientX, e.clientY);
      drag.startWorld = { px: p.x, py: p.y, nx: n.x, ny: n.y };
  
      // pointerup取り逃しを減らす: nodesEl は render() で消えないので capture 先を安定化
      nodesEl.setPointerCapture(e.pointerId);
  
      // ドラッグ対象DOMを保持（ドラッグ中は render() しない）
      drag.nodeEl = nodeEl;
  
      // テキスト選択などの事故防止
      e.preventDefault();
    });
  
    nodesEl.addEventListener("pointermove", (e) => {
      if (!drag.id || !drag.startWorld || !drag.startClient) return;
      if (drag.pointerId !== e.pointerId) return;
  
      const n = findNode(data, drag.id);
      if (!n) return;
  
      // ✅ しきい値：一定以上動いたら「ドラッグ開始」
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      if (!drag.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.active = true;
        // この時点で関連wireをキャッシュ（毎moveでqueryしない）
        drag.wireEls = getAffectedWiresForNode(drag.id);
      }
  
      const p = screenToWorld(e.clientX, e.clientY);
      n.x = drag.startWorld.nx + (p.x - drag.startWorld.px);
      n.y = drag.startWorld.ny + (p.y - drag.startWorld.py);
  
      // ドラッグ中は render() でDOMを作り直さない（pointer capture事故 & 重さ対策）
      if (drag.nodeEl){
        drag.nodeEl.style.left = `${n.x}px`;
        drag.nodeEl.style.top  = `${n.y}px`;
      }
  
      updateWiresForNode(drag.id, drag.wireEls);
    });
  
    // ✅ 解除は多重で保険（取り逃し防止）
    nodesEl.addEventListener("pointerup", (e) => {
    if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;
    endNodeDrag(true);
  });
  
    nodesEl.addEventListener("pointercancel", (e) => {
      if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;
      endNodeDrag(true);
    });
  
    nodesEl.addEventListener("lostpointercapture", () => {
      endNodeDrag(true);
    });
    // pan (drag background)
    let panning = false;
    let panStart = null;
  
    mapEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".node")) return;
      panning = true;
      mapEl.setPointerCapture(e.pointerId);
      panStart = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
    });
  
    mapEl.addEventListener("pointermove", (e) => {
      if (!panning || !panStart) return;
      view.ox = panStart.ox + (e.clientX - panStart.x);
      view.oy = panStart.oy + (e.clientY - panStart.y);
      applyWorldTransform();
    });
  
    mapEl.addEventListener("pointerup", () => {
      if (!panning) return;
      panning = false;
      panStart = null;
      saveAll("pan");
    });
  
    // wheel zoom
    mapEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      setZoom(view.scale + delta);
    }, { passive:false });
  
    // zoom buttons/slider
    zoomSlider.addEventListener("input", () => setZoom(Number(zoomSlider.value)));
    zoomInBtn.addEventListener("click", () => setZoom(view.scale + 0.10));
    zoomOutBtn.addEventListener("click", () => setZoom(view.scale - 0.10));
  
    // reset
    resetBtn.addEventListener("click", () => {
      if (!confirm("Reset all data?（全部消える）")) return;
      clearData();
      location.reload();
    });
  
    // priority click
    starBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const n = selectedId ? findNode(data, selectedId) : null;
        if (!n) return;
        n.priority = Number(btn.dataset.v);
        setPriorityUI(n.priority);
      });
    });
  
    // completed toggle
    completedInput.addEventListener("change", () => {
      const n = selectedId ? findNode(data, selectedId) : null;
      if (!n) return;
      n.completed = !!completedInput.checked;
      // visual feedback immediately
      render();
    });
  
    // lock title toggle
    lockTitleInput.addEventListener("change", () => {
      const n = selectedId ? findNode(data, selectedId) : null;
      if (!n) return;
      n.lockedTitle = !!lockTitleInput.checked;
      titleInput.disabled = !!n.lockedTitle;
    });
  
    // save
    saveBtn.addEventListener("click", () => {
      const n = selectedId ? findNode(data, selectedId) : null;
      if (!n) return;
  
      if (!n.lockedTitle){
        n.title = (titleInput.value || "").trim() || "Untitled";
      } else {
        // lockedなら表示だけ戻す
        titleInput.value = n.title || "";
      }
  
      n.notes = (notesInput.value || "").trim();
      n.completed = !!completedInput.checked;
      n.parentId = parentSelect.value || null;
      n.updatedAt = nowISO();
  
      saveAll("save");
      render();
      showToast("Saved ✓");
    });
  
// add child
addChildBtn.addEventListener("click", () => {
  const parent = selectedId ? findNode(data, selectedId) : null;
  if (!parent) return;

  const now = nowISO();
  const id = makeId();
  const ang = rand(0, Math.PI * 2);
  const radius = rand(110, 190);

  const isNewCategory = !!parent.isMe;

  const child = {
    id,
    title: isNewCategory ? "New category" : "New star",
    notes: "",
    priority: isNewCategory ? 1 : 3,
    parentId: parent.id,
    x: parent.x + Math.cos(ang)*radius,
    y: parent.y + Math.sin(ang)*radius,
    lockedTitle: isNewCategory ? true : false,
    completed: false,
    isMe: false,
    isCategory: isNewCategory,
    createdAt: now,
    updatedAt: now,
  };

  data.nodes.push(child);
  saveAll("addChild");
  select(child.id);
  showToast(isNewCategory ? "Added category ✦" : "Added ✦");
});
  
      data.nodes.push(child);
      saveAll("addChild");
      select(child.id);
      showToast("Added ✦");
    });
  
    // delete
    deleteBtn.addEventListener("click", () => {
      const n = selectedId ? findNode(data, selectedId) : null;
      if (!n || n.isMe) return;
  
      if (!confirm(`Delete "${n.title}" ?（戻せない）`)) return;
  
      // delete subtree too
      const toDelete = new Set([n.id]);
      let changed = true;
      while (changed){
        changed = false;
        for (const x of data.nodes){
          if (x.parentId && toDelete.has(x.parentId) && !toDelete.has(x.id)){
            toDelete.add(x.id);
            changed = true;
          }
        }
      }
      data.nodes = data.nodes.filter(x => !toDelete.has(x.id));
      saveAll("delete");
  
      // select Me
      const me = data.nodes.find(x => x.isMe);
      select(me ? me.id : null);
      showToast("Deleted");
    });

}

function setZoom(next){
  view.scale = clamp(next, 0.2, 2.5);
  zoomSlider.value = String(view.scale);
  applyWorldTransform();
  saveAll("zoom");
}

// convert screen -> world coords
function screenToWorld(clientX, clientY){
  const rect = mapEl.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;

  const x = (sx - view.ox) / view.scale;
  const y = (sy - view.oy) / view.scale;
  return { x, y };
}