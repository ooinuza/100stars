// listView.js
export function priorityColor(r){
  if (r === 2) return "#f5f3dc";
  if (r === 3) return "#ffe066";
  if (r === 4) return "#ffcc33";
  if (r === 5) return "#ff9fa3";
  return "#ffffff";
}

export function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;",
  }[c]));
}

/**
 * Build genre list HTML and bind clicks.
 * @param {object} state - app state
 * @param {Function} onSelect - function(id) to select node
 */
export function renderGenreList(state, onSelect){
  const panel = document.getElementById("listPanel");
  if (!panel) return;

  const cats = state.nodes.filter(n => n.parentId === "root");

  panel.innerHTML = cats.map(cat => {
    const kids = state.nodes
      .filter(n => n.parentId === cat.id)
      .sort((a,b) =>
        (b.rating||0) - (a.rating||0) ||
        (a.title||"").localeCompare(b.title||"", "en", { sensitivity:"base" })
      );

    const itemsHtml = kids.length
      ? kids.map(k => `
        <div class="listItem" data-id="${k.id}">
          <div class="listDot" style="background:${priorityColor(k.rating||1)}"></div>
          <div class="listTitle">${escapeHtml(k.title||"")}</div>
          <div class="listMeta">★${k.rating||0}</div>
        </div>
      `).join("")
      : `
        <div class="listItem" data-id="${cat.id}">
          <div class="listDot" style="background:${priorityColor(1)}"></div>
          <div class="listTitle">(no stars yet)</div>
          <div class="listMeta"></div>
        </div>
      `;

    return `
      <div class="listGroup">
        <div class="listGroupHead">
          <div>${escapeHtml(cat.title||"")}</div>
          <div class="listCount">${kids.length} items</div>
        </div>
        ${itemsHtml}
      </div>
    `;
  }).join("");

  panel.querySelectorAll(".listItem").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      onSelect(id);
    });
  });
}