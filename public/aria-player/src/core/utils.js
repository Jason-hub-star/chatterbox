// 범용 헬퍼 (fetch/수학/문자열).

import { state } from "../core/state.js";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.stderr || `${url} ${response.status}`);
  return data;
}

async function loadImages(project) {
  await Promise.all(
    project.parts.map(
      (part) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = "anonymous"; // Storage(크로스오리진) 텍스처를 WebGL이 쓰려면 CORS+crossOrigin 필수
          image.onload = () => {
            state.images.set(part.id, image);
            resolve();
          };
          image.onerror = () => reject(new Error(`image failed: ${part.source_path}`));
          const v = project.generated_at || "";
          image.src = `${project._project_base_url}${part.source_path}${v ? `?v=${encodeURIComponent(v)}` : ""}`;
        }),
    ),
  );
}

function bboxCenter(bbox) {
  return [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatValue(value) {
  return Number(value).toFixed(Math.abs(value) < 2 ? 2 : 0);
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


export { fetchJson, postJson, loadImages, bboxCenter, clamp, lerp, formatValue, groupBy, escapeHtml };
