const fs = require('fs');
let content = fs.readFileSync('assets/scripts/data/GameConfig.ts', 'utf8');

const newTemplates = export const OBJECT_TEMPLATES: readonly IObjectTemplate[] = [
  // T1
  { type: 'soda_can', name: 'Soda Can', tier: ObjectTier.T1, mass: 50, value: 5, radius: 0.25, color: '#e53935', shape: ObjectShape.CYLINDER, height: 0.5 },
  { type: 'water_bottle', name: 'Bottle', tier: ObjectTier.T1, mass: 65, value: 6, radius: 0.22, color: '#29b6f6', shape: ObjectShape.CYLINDER, height: 0.6 },
  { type: 'battery', name: 'Battery', tier: ObjectTier.T1, mass: 80, value: 10, radius: 0.18, color: '#fbc02d', shape: ObjectShape.CYLINDER, height: 0.35 },
  { type: 'toy', name: 'Toy', tier: ObjectTier.T1, mass: 100, value: 12, radius: 0.3, color: '#ff4081', shape: ObjectShape.BOX, size: [0.4, 0.4, 0.4] },

  // T2
  { type: 'book_stack', name: 'Books', tier: ObjectTier.T2, mass: 220, value: 25, radius: 0.45, color: '#1e88e5', shape: ObjectShape.BOX, size: [0.5, 0.3, 0.5] },
  { type: 'cardboard_box', name: 'Cardboard Box', tier: ObjectTier.T2, mass: 320, value: 35, radius: 0.5, color: '#d7ccc8', shape: ObjectShape.BOX, size: [0.6, 0.5, 0.6] },
  { type: 'cone', name: 'Traffic Cone', tier: ObjectTier.T2, mass: 280, value: 30, radius: 0.4, color: '#ff6f00', shape: ObjectShape.CONE, height: 0.7 },
  { type: 'trash_bag', name: 'Trash Bag', tier: ObjectTier.T2, mass: 350, value: 40, radius: 0.55, color: '#212121', shape: ObjectShape.SPHERE },

  // T3
  { type: 'chair', name: 'Chair', tier: ObjectTier.T3, mass: 950, value: 110, radius: 0.85, color: '#455a64', shape: ObjectShape.BOX, size: [0.8, 1.2, 0.8] },
  { type: 'small_table', name: 'Table', tier: ObjectTier.T3, mass: 1400, value: 160, radius: 1.0, color: '#795548', shape: ObjectShape.BOX, size: [1.5, 0.6, 1.0] },
  { type: 'monitor', name: 'Monitor', tier: ObjectTier.T3, mass: 1100, value: 130, radius: 0.8, color: '#111111', shape: ObjectShape.BOX, size: [1.2, 0.8, 0.3] },
  
  // T4
  { type: 'shelf', name: 'Shelf', tier: ObjectTier.T4, mass: 5500, value: 500, radius: 2.0, color: '#90a4ae', shape: ObjectShape.BOX, size: [2.5, 3.5, 1.0] },
  { type: 'crate', name: 'Crate', tier: ObjectTier.T4, mass: 8000, value: 800, radius: 2.5, color: '#388e3c', shape: ObjectShape.BOX, size: [3.0, 3.0, 3.0] },

  // T5
  { type: 'car', name: 'Car', tier: ObjectTier.T5, mass: 25000, value: 3000, radius: 3.5, color: '#d32f2f', shape: ObjectShape.BOX, size: [2.5, 1.5, 4.5] }
];;

content = content.replace(/export const OBJECT_TEMPLATES.*?(?=export const ROGUELIKE_PERKS)/s, newTemplates + '\n\n');
fs.writeFileSync('assets/scripts/data/GameConfig.ts', content);
