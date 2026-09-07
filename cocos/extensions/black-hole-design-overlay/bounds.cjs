'use strict';

// Pure numeric helpers. Native Cocos supplies the transformed corners.
function canvasBounds(corners, size, anchor, designSpace) {
  if (corners.length !== 4 || !(size.width > 0 && size.height > 0)) return null;
  const points = corners.map((p) => ({
    x: (p.x / size.width + anchor.x) * designSpace.width,
    y: (1 - anchor.y - p.y / size.height) * designSpace.height,
  }));
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const x = Math.min(...points.map((p) => p.x));
  const y = Math.min(...points.map((p) => p.y));
  return { x, y, width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y };
}

function compareBounds(reference, actual, tolerance = {}) {
  const valid = (b) => b && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k]))
    && b.width > 0 && b.height > 0;
  if (!valid(reference) || !valid(actual)) {
    return { referenceBounds: reference ?? null, actualBounds: actual ?? null,
      delta: null, tolerance, pass: false };
  }
  const delta = { dx: actual.x - reference.x, dy: actual.y - reference.y,
    dw: actual.width - reference.width, dh: actual.height - reference.height };
  const limit = (key, fallback) => Number.isFinite(tolerance[key]) && tolerance[key] >= 0
    ? tolerance[key] : fallback;
  return { referenceBounds: reference, actualBounds: actual, delta, tolerance,
    pass: Math.abs(delta.dx) <= limit('x', 8) && Math.abs(delta.dy) <= limit('y', 8)
      && Math.abs(delta.dw) <= limit('width', 10) && Math.abs(delta.dh) <= limit('height', 10) };
}

function matchElement(nodes, element, rootPath) {
  const scoped = rootPath ? nodes.filter((n) => n.path === rootPath || n.path.startsWith(`${rootPath}/`)) : nodes;
  const candidates = scoped.filter((n) => element.nodePath ? n.path === element.nodePath : n.name === element.nodeName);
  return { status: candidates.length === 0 ? 'MISSING_ELEMENT' : candidates.length > 1 ? 'AMBIGUOUS_ELEMENT' : 'FOUND',
    node: candidates.length === 1 ? candidates[0] : null, candidates: candidates.map((n) => n.path) };
}

module.exports = { canvasBounds, compareBounds, matchElement };
