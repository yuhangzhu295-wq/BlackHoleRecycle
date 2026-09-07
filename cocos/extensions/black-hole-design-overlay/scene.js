'use strict';

const fs = require('fs');
const path = require('path');
const { canvasBounds, compareBounds, matchElement } = require('./bounds.cjs');

const DESIGN_SPACE = { width: 720, height: 1280 };
const REPORT_DIR = path.resolve(__dirname, '../../docs/evidence/v2/design-audit');

function plain(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item !== 'function') result[key] = plain(item);
  }
  return result;
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function componentName(component) {
  if (!component) return null;
  if (component.constructor?.name) return component.constructor.name;
  return component.__classname__ || component.__type__ || null;
}

function nodeRecord(node, parentPath = '') {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const transform = node.getComponent?.('cc.UITransform') || node.getComponent?.('UITransform');
  const position = node.position || { x: 0, y: 0, z: 0 };
  const anchor = transform?.anchorPoint || { x: 0.5, y: 0.5 };
  const size = transform?.contentSize || { width: 0, height: 0 };
  return {
    path: currentPath,
    name: node.name,
    uuid: node.uuid || null,
    active: !!node.active,
    activeInHierarchy: !!node.activeInHierarchy,
    bounds: actualBounds(node),
    position: { x: number(position.x), y: number(position.y), z: number(position.z) },
    anchor: { x: number(anchor.x, 0.5), y: number(anchor.y, 0.5) },
    size: { width: number(size.width), height: number(size.height) },
    components: (node.components || []).map(componentName).filter(Boolean),
    spriteFrame: node.getComponent?.('cc.Sprite')?.spriteFrame?.name || node.getComponent?.('Sprite')?.spriteFrame?.name || null,
    children: (node.children || []).map((child) => nodeRecord(child, currentPath)),
  };
}

function flatten(tree, result = []) {
  if (!tree) return result;
  result.push(tree);
  for (const child of tree.children || []) flatten(child, result);
  return result;
}

function findPageBlueprint(page) {
  const file = path.resolve(__dirname, `../../docs/design-contracts/${page === 'arena_hud' ? 'gameplay-arena' : page}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { page, status: 'REFERENCE_BLUEPRINT_DRAFT', elements: [] };
  }
}

function actualBounds(node) {
  if (!node) return null;
  const { UITransform, Canvas, Vec3 } = require('cc');
  const transform = node.getComponent(UITransform);
  if (!transform) return null;
  let canvasNode = node;
  while (canvasNode && !canvasNode.getComponent(Canvas)) canvasNode = canvasNode.parent;
  const canvas = canvasNode?.getComponent(UITransform);
  if (!canvas) return null;
  const size = transform.contentSize;
  const anchor = transform.anchorPoint;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => {
    const world = transform.convertToWorldSpaceAR(new Vec3((x - anchor.x) * size.width, (y - anchor.y) * size.height, 0));
    return canvas.convertToNodeSpaceAR(world);
  });
  return canvasBounds(corners, canvas.contentSize, canvas.anchorPoint, DESIGN_SPACE);
}

module.exports = {
  methods: {
    inspectCurrentScene(page = 'arena_hud') {
      const { director } = require('cc');
      const scene = director.getScene();
      const tree = scene ? nodeRecord(scene) : null;
      const flat = flatten(tree);
      const blueprint = findPageBlueprint(page);
      const elementReports = (blueprint.elements || []).map((element) => {
        const match = matchElement(flat, element, blueprint.rootPath);
        const node = match.node;
        const comparison = compareBounds(element.referenceBounds, node?.bounds, element.tolerance);
        return {
          id: element.id,
          nodeName: element.nodeName,
          found: !!node,
          matchStatus: match.status,
          candidates: match.candidates,
          activeInHierarchy: node?.activeInHierarchy ?? false,
          components: node?.components || [],
          spriteFrame: node?.spriteFrame || null,
          ...comparison,
          pass: comparison.pass && !!node?.activeInHierarchy,
        };
      });
      const graphics = flat.filter((entry) => entry.components.includes('Graphics') || entry.components.includes('cc.Graphics'));
      return {
        schema: 'black-hole-design-overlay/v2',
        readOnly: true,
        measurement: 'native-ui-transform-corners-in-canvas-design-space',
        status: 'MEASURED_NOT_DESIGN_APPROVED',
        page,
        designSpace: DESIGN_SPACE,
        scene: scene?.name || null,
        blueprintStatus: blueprint.status || 'REFERENCE_BLUEPRINT_DRAFT',
        nodes: flat,
        elementReports,
        graphicsAudit: {
          count: graphics.length,
          nodes: graphics.map((entry) => entry.path),
          allowedDynamicNames: ['Joystick', 'JoystickBase', 'JoystickKnob'],
        },
        generatedAt: new Date().toISOString(),
      };
    },
    exportAuditReport(report) {
      if (!report || report.readOnly !== true) throw new Error('Refusing to export an invalid or mutable report');
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      const safePage = String(report.page || 'unknown').replace(/[^a-z0-9_-]/gi, '_');
      const filename = `${safePage}-${Date.now()}.json`;
      const output = path.join(REPORT_DIR, filename);
      fs.writeFileSync(output, `${JSON.stringify(plain(report), null, 2)}\n`, 'utf8');
      return { exported: true, path: output, sceneMutation: false };
    },
  },
};
