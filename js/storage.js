import { STORAGE_KEY } from "./constants.js";

export function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveData(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearData(){
  localStorage.removeItem(STORAGE_KEY);
}