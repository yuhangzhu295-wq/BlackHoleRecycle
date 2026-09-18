import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builderPath = path.join(repo, 'cocos', 'extensions', 'black-hole-world-art-builder', 'scene.js');
const source = fs.readFileSync(builderPath, 'utf8');

const expectSource = (needle, message) => assert.match(source, needle, message);

// This protects the future official Creator recipe only. It is deliberately not
// proof that a prefab was written or that the portrait runtime gate passes.
for (const field of [
  'parkFountainTemplate', 'parkBenchTemplate', 'parkTrashcanTemplate',
  'parkFlowerATemplate', 'parkFlowerBTemplate', 'parkHedgeLongTemplate',
  'commercialBuildingDTemplate', 'commercialBuildingFTemplate',
]) {
  expectSource(new RegExp("field: '" + field + "'"), 'missing Creator asset recipe: ' + field);
}

for (const landmark of [
  'CommercialShopEast', 'Hospital_ClinicNorth', 'CommercialMarketSouth',
  'POI_ParkFountain', 'ParkBenchWest', 'ParkBenchEast', 'ParkBinWest',
  'ParkBinEast', 'FlowerbedWest', 'FlowerbedEast',
]) {
  expectSource(new RegExp("['\"]" + landmark + "['\"]"), 'missing authored landmark: ' + landmark);
}

for (const road of ['RoadNorth', 'RoadEast', 'RoadSouth', 'RoadWest']) {
  expectSource(new RegExp("['\"]" + road + "['\"]"), 'missing traffic route point: ' + road);
}

const vehicleAnchorCount = (source.match(/VehicleAnchor_(?:Sedan|DeliveryVan|GarbageTruck)/g) || []).length;
assert.ok(vehicleAnchorCount >= 5, 'need five authored DynamicVehicle source anchors for portrait traffic density');
assert.match(source, /source anchors become pooled DynamicVehicles at runtime/, 'traffic must remain runtime lifecycle owned');
assert.match(source, /trees frame the player without relying on a camera adjustment/, 'recipe must not solve composition by camera changes');

console.log('[PASS] Golden City builder recipe semantic coverage (NON_RUNTIME; Creator writeback and portrait acceptance remain required).');
