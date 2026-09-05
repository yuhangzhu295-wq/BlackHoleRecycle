/**
 * Cocos-side visual replica for a Colyseus-authoritative arena.
 *
 * This class has no movement, suction, combat, evolution, reward, or input
 * authority. It only maps the latest room snapshot to Cocos nodes that use
 * the same imported city/machine art as the local arena. Keeping that boundary
 * explicit prevents a connected client from silently simulating its own match.
 */
import { Node, Vec3 } from 'cc';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import {
  AuthoritativeArenaPickup,
  AuthoritativeArenaPlayer,
  AuthoritativeArenaSnapshot,
} from './ColyseusArenaClient';
import { WorldArtKind, WorldArtLibrary } from '../world/WorldArtLibrary';

export interface NetworkArenaReplicaDiagnostics {
  readonly localSessionId: string | null;
  readonly localPosition: Readonly<{ x: number; z: number }> | null;
  readonly visiblePlayers: number;
  readonly visiblePickups: number;
  readonly playerIds: readonly string[];
  readonly pickupIds: readonly string[];
}

const BOT_TINTS = ['#4e9af1', '#54c985', '#e7a545', '#b26ae8', '#4bbfd2', '#f07171', '#d7bd53', '#d7bd53'];

const pickupArtFor = (pickup: AuthoritativeArenaPickup): WorldArtKind => {
  if (pickup.tier >= 3) return 'shippingContainer';
  if (pickup.tier === 2) return 'crate';
  return pickup.mass >= 100 ? 'recyclingBox' : 'sodaCan';
};

/**
 * A renderer-only entity cache. The local machine is supplied by GameManager;
 * remote players are real BlackHoleMachine visual components whose movement is
 * paused so only server snapshots can move them.
 */
export class NetworkArenaReplica {
  private readonly remotePlayers = new Map<string, BlackHoleMachine>();
  private readonly pickupNodes = new Map<string, Node>();
  private localPosition: Vec3 | null = null;
  private localSessionId: string | null = null;

  public constructor(
    private readonly root: Node,
    private readonly localMachine: BlackHoleMachine,
    private readonly artLibrary: WorldArtLibrary,
  ) {}

  public sync(snapshot: AuthoritativeArenaSnapshot): void {
    this.localSessionId = snapshot.localSessionId;
    this.syncPlayers(snapshot.players, snapshot.localSessionId);
    this.syncPickups(snapshot.pickups);
  }

  public getLocalPosition(): Readonly<Vec3> | null {
    return this.localPosition?.clone() || null;
  }

  public getDiagnostics(): NetworkArenaReplicaDiagnostics {
    return {
      localSessionId: this.localSessionId,
      localPosition: this.localPosition ? { x: this.localPosition.x, z: this.localPosition.z } : null,
      visiblePlayers: Array.from(this.remotePlayers.values()).filter((machine) => machine.node.activeInHierarchy).length
        + (this.localMachine.node.activeInHierarchy ? 1 : 0),
      visiblePickups: Array.from(this.pickupNodes.values()).filter((node) => node.activeInHierarchy).length,
      playerIds: [
        ...(this.localSessionId ? [this.localSessionId] : []),
        ...Array.from(this.remotePlayers.keys()).sort(),
      ],
      pickupIds: Array.from(this.pickupNodes.keys()).sort(),
    };
  }

  public clear(): void {
    for (const machine of this.remotePlayers.values()) {
      if (machine.node.isValid) machine.node.destroy();
    }
    this.remotePlayers.clear();
    for (const node of this.pickupNodes.values()) {
      if (node.isValid) node.destroy();
    }
    this.pickupNodes.clear();
    this.localPosition = null;
    this.localSessionId = null;
  }

  private syncPlayers(players: readonly AuthoritativeArenaPlayer[], localSessionId: string | null): void {
    const activeRemoteIds = new Set<string>();
    let foundLocal = false;
    players.forEach((player, index) => {
      const isLocal = player.id === localSessionId;
      if (isLocal) {
        foundLocal = true;
        this.applyPlayer(this.localMachine, player, true, index);
        this.localPosition = new Vec3(player.x, 0, player.z);
        return;
      }

      activeRemoteIds.add(player.id);
      const machine = this.getOrCreateRemoteMachine(player.id, index);
      this.applyPlayer(machine, player, false, index);
    });

    if (!foundLocal) {
      this.localMachine.node.active = false;
      this.localPosition = null;
    }
    for (const [id, machine] of this.remotePlayers) {
      if (!activeRemoteIds.has(id) && machine.node.isValid) machine.node.destroy();
    }
    for (const id of this.remotePlayers.keys()) {
      if (!activeRemoteIds.has(id)) this.remotePlayers.delete(id);
    }
  }

  private getOrCreateRemoteMachine(id: string, index: number): BlackHoleMachine {
    const existing = this.remotePlayers.get(id);
    if (existing?.node.isValid) return existing;

    const node = new Node(`NetworkArenaPlayer_${id}`);
    this.root.addChild(node);
    const machine = node.addComponent(BlackHoleMachine);
    machine.setPresentation('BOT');
    machine.setArenaBotTint(BOT_TINTS[index % BOT_TINTS.length]);
    machine.isPaused = true;
    this.remotePlayers.set(id, machine);
    return machine;
  }

  private applyPlayer(machine: BlackHoleMachine, player: AuthoritativeArenaPlayer, isLocal: boolean, index: number): void {
    machine.node.active = player.alive;
    machine.setPresentation(isLocal ? 'SINGULARITY' : 'BOT');
    if (!isLocal) machine.setArenaBotTint(BOT_TINTS[index % BOT_TINTS.length]);
    machine.currentMass = player.mass;
    if (machine.currentLevel !== player.level) machine.applyEvolutionLevel(player.level, false);
    machine.node.setPosition(player.x, 0, player.z);
    machine.resetMovement();
    machine.isPaused = true;
  }

  private syncPickups(pickups: readonly AuthoritativeArenaPickup[]): void {
    const activeIds = new Set<string>();
    for (const pickup of pickups) {
      activeIds.add(pickup.id);
      let node = this.pickupNodes.get(pickup.id) || null;
      if (!node?.isValid) {
        node = this.artLibrary.spawn(
          pickupArtFor(pickup),
          this.root,
          new Vec3(pickup.x, 0.16, pickup.z),
          pickup.tier >= 2 ? new Vec3(0.9, 0.9, 0.9) : new Vec3(0.62, 0.62, 0.62),
          0,
          `NetworkArenaPickup_${pickup.id}`,
        );
        this.pickupNodes.set(pickup.id, node);
      }
      node.active = pickup.state !== 'ABSORBED';
      node.setPosition(pickup.x, 0.16, pickup.z);
    }

    for (const [id, node] of this.pickupNodes) {
      if (!activeIds.has(id) && node.isValid) node.destroy();
    }
    for (const id of this.pickupNodes.keys()) {
      if (!activeIds.has(id)) this.pickupNodes.delete(id);
    }
  }
}
