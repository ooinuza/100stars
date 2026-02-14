export function makeId(){
  return "s_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}

export function nowISO(){
  return new Date().toISOString();
}

export function clamp(n, a, b){
  return Math.max(a, Math.min(b, n));
}

export function rand(min, max){
  return min + Math.random() * (max - min);
}

export function deepClone(x){
  return JSON.parse(JSON.stringify(x));
}

export function findNode(data, id){
  return data.nodes.find(n => n.id === id) || null;
}

export function childrenOf(data, parentId){
  return data.nodes.filter(n => n.parentId === parentId);
}

export function rootCategoryOf(data, node){
  // walk up until category or me
  let cur = node;
  const guard = new Set();
  while (cur && cur.parentId){
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    const p = findNode(data, cur.parentId);
    if (!p) break;
    if (p.isCategory) return p.title;
    cur = p;
  }
  if (node.isCategory) return node.title;
  return "";
}