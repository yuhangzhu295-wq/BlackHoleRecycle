/**
 * Local eight-player arena match authority.
 *
 * This is deliberately a gameplay system rather than a cosmetic leaderboard:
 * every rank comes from real machine mass, every pickup advances the existing
 * CompressibleObject suction FSM, and eliminations create real recyclable
 * mass fragments in InfiniteWorldManager.  The local implementation is the
 * offline 1-human + 7-bot fallback until an authoritative Colyseus service is
 * added; it does not claim to be an online match.
 */
import { _decorator, CCFloat, Component, Node, Vec3 } from 'cc';
import { MACHINE_EVOLUTION_CONFIG } from '../data/GameConfig';
import { BlackHoleMachine } from '../machine/BlackHoleMachine';
import { InfiniteWorldManager } from '../world/InfiniteWorldManager';
import { CompressibleObject } from './CompressibleObject';

const { ccclass, property } = _decorator;

export type ArenaBotState = 'ROAM' | 'COLLECT' | 'CHASE' | 'FLEE' | 'EVENT_HUNT' | 'RECOVER';

export interface ArenaLeaderboardEntry {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;
  readonly mass: number;
  readonly kills: number;
  readonly consumed: number;
  readonly alive: boolean;
  readonly shieldSeconds: number;
  readonly behavior: ArenaBotState | 'LOCAL';
  /** Render-space position is read-only evidence used by real touch QA. */
  readonly position: Readonly<{ x: number; z: number }>;
}

export interface ArenaMatchSnapshot {
  readonly running: boolean;
  readonly elapsedSeconds: number;
  readonly remainingSeconds: number;
  readonly durationSeconds: number;
  readonly competitorCount: number;
  readonly localRank: number;
  readonly localAlive: boolean;
  readonly localRespawnSeconds: number;
  readonly localKills: number;
  readonly localConsumed: number;
  readonly localMass: number;
  readonly leaderboard: readonly ArenaLeaderboardEntry[];
  readonly botStates: Readonly<Record<string, ArenaBotState>>;
  readonly eliminationCount: number;
  readonly reason: 'RUNNING' | 'TIME' | 'FORFEIT';
}

export interface ArenaMatchCallbacks {
  readonly onLocalObjectAbsorbed: (object: CompressibleObject) => void;
  readonly onLocalDefeated: (snapshot: ArenaMatchSnapshot) => void;
  readonly onLocalRespawned: (snapshot: ArenaMatchSnapshot) => void;
  readonly onMatchFinished: (snapshot: ArenaMatchSnapshot) => void;
}

interface ArenaCompetitor {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;
  readonly isBot: boolean;
  readonly slot: number;
  readonly node: Node;
  readonly machine: BlackHoleMachine;
  alive: boolean;
  respawnSeconds: number;
  shieldSeconds: number;
  kills: number;
  consumed: number;
  behavior: ArenaBotState;
  targetId: string | null;
  pulledBy: string | null;
  pullSeconds: number;
}

const BOT_NAMES = ['蓝莓', '矿石', '风暴', '火花', '雪球', '流光', '哨兵'];
const PLAYER_ID = 'local-player';
const MATCH_DURATION_SECONDS = 180;
const RESPAWN_SECONDS = 2.5;
const SHIELD_SECONDS = 3;
const START_MASS = 240;
const ARENA_RADIUS = 44;
const GRAVITY_RANGE = 4.8;
const CONSUME_RANGE = 1.28;
const CONSUME_RATIO = 1.32;

const distanceXZ = (left: Readonly<Vec3>, right: Readonly<Vec3>): number => {
  const x = left.x - right.x;
  const z = left.z - right.z;
  return Math.sqrt(x * x + z * z);
};

const directionXZ = (from: Readonly<Vec3>, to: Readonly<Vec3>, out: Vec3): Vec3 => {
  out.set(to.x - from.x, 0, to.z - from.z);
  if (out.lengthSqr() > 0.0001) out.normalize();
  else out.set(0, 0, 0);
  return out;
};

@ccclass('ArenaMatchManager')
export class ArenaMatchManager extends Component {
  /** Creator-saved configuration: a full match always has one local player and seven bots. */
  @property({ type: CCFloat, min: 30, max: 600, step: 1 })
  public durationSeconds: number = MATCH_DURATION_SECONDS;

  @property({ type: CCFloat, min: 20, max: 80, step: 1 })
  public boundaryRadius: number = ARENA_RADIUS;

  public running: boolean = false;
  private elapsedSeconds: number = 0;
  private endReason: 'RUNNING' | 'TIME' | 'FORFEIT' = 'RUNNING';
  private world: InfiniteWorldManager | null = null;
  private callbacks: ArenaMatchCallbacks | null = null;
  private readonly competitors: ArenaCompetitor[] = [];
  private readonly steering: Vec3 = new Vec3();
  private eliminationCount: number = 0;

  public startMatch(
    playerMachine: BlackHoleMachine,
    world: InfiniteWorldManager,
    callbacks: ArenaMatchCallbacks,
  ): void {
    this.clearBots();
    this.running = true;
    this.elapsedSeconds = 0;
    this.endReason = 'RUNNING';
    this.eliminationCount = 0;
    this.world = world;
    this.callbacks = callbacks;
    this.node.active = true;

    this.prepareMachine(playerMachine, START_MASS);
    playerMachine.setPresentation('SINGULARITY');
    playerMachine.node.setPosition(0, 0, 0);
    this.competitors.push({
      id: PLAYER_ID,
      name: '你',
      isLocal: true,
      isBot: false,
      slot: 0,
      node: playerMachine.node,
      machine: playerMachine,
      alive: true,
      respawnSeconds: 0,
      shieldSeconds: SHIELD_SECONDS,
      kills: 0,
      consumed: 0,
      behavior: 'ROAM',
      targetId: null,
      pulledBy: null,
      pullSeconds: 0,
    });

    for (let slot = 1; slot < 8; slot++) {
      const node = new Node(`ArenaBot_${slot}`);
      this.node.addChild(node);
      const machine = node.addComponent(BlackHoleMachine);
      this.prepareMachine(machine, START_MASS);
      machine.setPresentation('BOT');
      const spawn = this.spawnPosition(slot);
      node.setPosition(spawn);
      this.competitors.push({
        id: `bot-${slot}`,
        name: BOT_NAMES[slot - 1],
        isLocal: false,
        isBot: true,
        slot,
        node,
        machine,
        alive: true,
        respawnSeconds: 0,
        shieldSeconds: SHIELD_SECONDS,
        kills: 0,
        consumed: 0,
        behavior: 'ROAM',
        targetId: null,
        pulledBy: null,
        pullSeconds: 0,
      });
    }
  }

  public stopMatch(): void {
    this.running = false;
    this.clearBots();
    this.world = null;
    this.callbacks = null;
    this.node.active = false;
  }

  /** Freeze every physical machine when the shared pause page is shown. */
  public setMatchPaused(paused: boolean): void {
    for (const competitor of this.competitors) competitor.machine.isPaused = paused || !competitor.alive;
  }

  /** Called from GameManager after streamed cells have been updated. */
  public updateMatch(dt: number): void {
    if (!this.running || !this.world || dt <= 0) return;

    this.elapsedSeconds += dt;
    for (const competitor of this.competitors) {
      this.updateLifeState(competitor, dt);
      if (!competitor.alive) continue;
      competitor.shieldSeconds = Math.max(0, competitor.shieldSeconds - dt);
      if (competitor.isBot) this.updateBotBrain(competitor);
      this.keepInsideArena(competitor);
    }

    this.world.updateDynamicTraffic(dt);
    this.updateCompetitiveSuction(dt);
    this.updateCompetitorCombat(dt);

    if (this.elapsedSeconds >= this.durationSeconds) this.finish('TIME');
  }

  /** A visible revive button can skip the normal respawn countdown. */
  public reviveLocal(): boolean {
    const local = this.getLocalCompetitor();
    if (!this.running || !local || local.alive) return false;
    local.respawnSeconds = 0;
    this.respawn(local);
    return true;
  }

  /** Deliberately exposed as a match action, never as a QA-state setter. */
  public forfeitLocal(): void {
    if (this.running) this.finish('FORFEIT');
  }

  public getSnapshot(): ArenaMatchSnapshot {
    const ordered = this.getLeaderboard();
    const local = this.getLocalCompetitor();
    const localIndex = local ? ordered.findIndex((entry) => entry.id === local.id) : -1;
    const botStates: Record<string, ArenaBotState> = {};
    for (const competitor of this.competitors) {
      if (competitor.isBot) botStates[competitor.id] = competitor.behavior;
    }
    return {
      running: this.running,
      elapsedSeconds: Math.max(0, this.elapsedSeconds),
      remainingSeconds: Math.max(0, this.durationSeconds - this.elapsedSeconds),
      durationSeconds: this.durationSeconds,
      competitorCount: this.competitors.length,
      localRank: localIndex >= 0 ? localIndex + 1 : 0,
      localAlive: local?.alive || false,
      localRespawnSeconds: local?.respawnSeconds || 0,
      localKills: local?.kills || 0,
      localConsumed: local?.consumed || 0,
      localMass: local?.machine.currentMass || 0,
      leaderboard: ordered,
      botStates,
      eliminationCount: this.eliminationCount,
      reason: this.endReason,
    };
  }

  private prepareMachine(machine: BlackHoleMachine, mass: number): void {
    machine.currentMass = Math.max(0, mass);
    machine.applyEvolutionLevel(this.levelForMass(machine.currentMass), false);
    machine.isPaused = false;
    machine.resetMovement();
    machine.node.active = true;
  }

  private updateLifeState(competitor: ArenaCompetitor, dt: number): void {
    if (competitor.alive) return;
    competitor.respawnSeconds = Math.max(0, competitor.respawnSeconds - dt);
    if (competitor.respawnSeconds <= 0) this.respawn(competitor);
  }

  private respawn(competitor: ArenaCompetitor): void {
    competitor.alive = true;
    competitor.respawnSeconds = 0;
    competitor.shieldSeconds = SHIELD_SECONDS;
    competitor.pulledBy = null;
    competitor.pullSeconds = 0;
    competitor.targetId = null;
    competitor.behavior = competitor.isBot ? 'RECOVER' : 'ROAM';
    competitor.node.active = true;
    competitor.machine.isPaused = false;
    competitor.machine.resetMovement();
    competitor.node.setPosition(this.spawnPosition(competitor.slot));
    if (competitor.isLocal) this.callbacks?.onLocalRespawned(this.getSnapshot());
  }

  private updateBotBrain(bot: ArenaCompetitor): void {
    const position = bot.node.position;
    const threats = this.competitors
      .filter((other) => other.id !== bot.id && other.alive && other.machine.currentMass >= bot.machine.currentMass * CONSUME_RATIO)
      .sort((left, right) => distanceXZ(position, left.node.position) - distanceXZ(position, right.node.position));
    const threat = threats[0] || null;
    if (threat && distanceXZ(position, threat.node.position) < 13) {
      bot.behavior = 'FLEE';
      bot.targetId = threat.id;
      directionXZ(threat.node.position, position, this.steering);
      bot.machine.setMovementDirection(this.steering, 1);
      return;
    }

    const prey = this.competitors
      .filter((other) => other.id !== bot.id && other.alive && other.shieldSeconds <= 0
        && bot.machine.currentMass >= other.machine.currentMass * CONSUME_RATIO)
      .sort((left, right) => distanceXZ(position, left.node.position) - distanceXZ(position, right.node.position))[0] || null;
    if (prey && distanceXZ(position, prey.node.position) < 15) {
      bot.behavior = 'CHASE';
      bot.targetId = prey.id;
      directionXZ(position, prey.node.position, this.steering);
      bot.machine.setMovementDirection(this.steering, 0.9);
      return;
    }

    const pickup = (this.world?.getAllObjects() || [])
      .filter((object) => object.getState() === 'IDLE' && !object.getCaptureOwnerId()
        && object.template.tier <= bot.machine.getMaxTier())
      .sort((left, right) => distanceXZ(position, left.getPosition()) - distanceXZ(position, right.getPosition()))[0] || null;
    if (pickup && distanceXZ(position, pickup.getPosition()) < 28) {
      bot.behavior = 'COLLECT';
      bot.targetId = pickup.runtimeId;
      directionXZ(position, pickup.getPosition(), this.steering);
      bot.machine.setMovementDirection(this.steering, 0.82);
      return;
    }

    // Deterministic patrol sector: this is navigation to a stable target,
    // not a random-walk placeholder.
    bot.behavior = 'ROAM';
    bot.targetId = null;
    const phase = this.elapsedSeconds * 0.22 + bot.slot * 0.81;
    const target = new Vec3(Math.cos(phase) * 24, 0, Math.sin(phase) * 24);
    directionXZ(position, target, this.steering);
    bot.machine.setMovementDirection(this.steering, 0.5);
  }

  private updateCompetitiveSuction(dt: number): void {
    if (!this.world) return;
    const active = this.competitors.filter((competitor) => competitor.alive);
    for (const object of this.world.getAllObjects()) {
      const state = object.getState();
      if (state === 'ABSORBED' || state === 'RECYCLED') continue;

      let owner = object.getCaptureOwnerId();
      let collector = owner ? active.find((competitor) => competitor.id === owner) || null : null;
      if (!collector) {
        const position = object.getPosition();
        collector = active
          .filter((competitor) => object.template.tier <= competitor.machine.getMaxTier()
            && distanceXZ(competitor.node.position, position) <= competitor.machine.getSuctionRadius())
          .sort((left, right) => distanceXZ(left.node.position, position) - distanceXZ(right.node.position, position))[0] || null;
      }
      if (!collector) continue;
      owner = collector.id;
      const absorbed = object.updateMotion(
        dt,
        collector.node.position,
        collector.machine.getSuctionRadius(),
        collector.machine.getMaxTier(),
        collector.machine.isMagnetStormActive,
        owner,
      );
      if (absorbed) this.consumeObject(collector, object);
    }
  }

  private consumeObject(competitor: ArenaCompetitor, object: CompressibleObject): void {
    competitor.consumed++;
    if (competitor.isLocal) {
      // The player still feeds the existing buffered CompressionSystem. Its
      // mass and coins therefore arrive through the normal real pipeline.
      this.callbacks?.onLocalObjectAbsorbed(object);
      return;
    }
    // Bots do not own a player-only CompressionSystem, but their mass is only
    // awarded after this exact real world object has reached ABSORBED.
    competitor.machine.addMass(object.template.mass);
  }

  private updateCompetitorCombat(dt: number): void {
    for (let left = 0; left < this.competitors.length; left++) {
      const a = this.competitors[left];
      if (!a.alive || a.shieldSeconds > 0) continue;
      for (let right = left + 1; right < this.competitors.length; right++) {
        const b = this.competitors[right];
        if (!b.alive || b.shieldSeconds > 0) continue;
        const attacker = a.machine.currentMass >= b.machine.currentMass ? a : b;
        const victim = attacker === a ? b : a;
        if (attacker.machine.currentMass < Math.max(1, victim.machine.currentMass) * CONSUME_RATIO) continue;
        const distance = distanceXZ(attacker.node.position, victim.node.position);
        if (distance > GRAVITY_RANGE) {
          if (victim.pulledBy === attacker.id) {
            victim.pulledBy = null;
            victim.pullSeconds = 0;
          }
          continue;
        }

        victim.pulledBy = attacker.id;
        victim.pullSeconds += dt;
        directionXZ(victim.node.position, attacker.node.position, this.steering);
        const victimPosition = victim.node.position.clone();
        victimPosition.x += this.steering.x * dt * 2.4;
        victimPosition.z += this.steering.z * dt * 2.4;
        victim.node.setPosition(victimPosition);
        victim.machine.velocity.multiplyScalar(0.45);
        if (distance <= CONSUME_RANGE && victim.pullSeconds >= 0.8) {
          this.defeat(attacker, victim);
          break;
        }
      }
    }
  }

  private defeat(attacker: ArenaCompetitor, victim: ArenaCompetitor): void {
    if (!victim.alive) return;
    const position = victim.node.position.clone();
    const droppedMass = Math.max(100, Math.round(victim.machine.currentMass * 0.35));
    this.world?.spawnArenaMassFragments(position, droppedMass, victim.id);
    attacker.kills++;
    victim.machine.currentMass = Math.max(0, victim.machine.currentMass - droppedMass);
    victim.machine.applyEvolutionLevel(this.levelForMass(victim.machine.currentMass), false);
    victim.alive = false;
    victim.respawnSeconds = RESPAWN_SECONDS;
    victim.shieldSeconds = 0;
    victim.pulledBy = null;
    victim.pullSeconds = 0;
    victim.machine.resetMovement();
    victim.machine.isPaused = true;
    victim.node.active = false;
    this.eliminationCount++;
    if (victim.isLocal) this.callbacks?.onLocalDefeated(this.getSnapshot());
  }

  private keepInsideArena(competitor: ArenaCompetitor): void {
    const position = competitor.node.position.clone();
    const distance = Math.sqrt(position.x * position.x + position.z * position.z);
    if (distance <= this.boundaryRadius) return;
    const scale = this.boundaryRadius / Math.max(distance, 0.001);
    position.x *= scale;
    position.z *= scale;
    competitor.node.setPosition(position);
    competitor.machine.velocity.multiplyScalar(0.25);
  }

  private finish(reason: 'TIME' | 'FORFEIT'): void {
    if (!this.running) return;
    this.endReason = reason;
    this.running = false;
    for (const competitor of this.competitors) competitor.machine.stopMovement();
    this.callbacks?.onMatchFinished(this.getSnapshot());
  }

  private getLeaderboard(): ArenaLeaderboardEntry[] {
    return [...this.competitors]
      .sort((left, right) => right.machine.currentMass - left.machine.currentMass
        || right.kills - left.kills
        || right.consumed - left.consumed
        || left.slot - right.slot)
      .map((competitor) => ({
        id: competitor.id,
        name: competitor.name,
        isLocal: competitor.isLocal,
        mass: Math.round(competitor.machine.currentMass),
        kills: competitor.kills,
        consumed: competitor.consumed,
        alive: competitor.alive,
        shieldSeconds: Math.max(0, competitor.shieldSeconds),
        behavior: competitor.isLocal ? 'LOCAL' : competitor.behavior,
        position: { x: competitor.node.position.x, z: competitor.node.position.z },
      }));
  }

  private getLocalCompetitor(): ArenaCompetitor | null {
    return this.competitors.find((competitor) => competitor.isLocal) || null;
  }

  private spawnPosition(slot: number): Vec3 {
    if (slot === 0) return new Vec3(0, 0, 0);
    const angle = (Math.PI * 2 * (slot - 1)) / 7 + Math.PI * 0.13;
    // A 20m ring left every authentic bot outside the portrait opening shot,
    // making the match look vacant despite an eight-player roster.  This is
    // only an initial location: bots retain their same movement, resource
    // claims, collision and respawn rules once the match begins.
    return new Vec3(Math.cos(angle) * 8.8, 0, Math.sin(angle) * 8.8);
  }

  private levelForMass(mass: number): number {
    for (let index = MACHINE_EVOLUTION_CONFIG.length - 1; index >= 0; index--) {
      if (mass >= MACHINE_EVOLUTION_CONFIG[index].massThreshold) return index + 1;
    }
    return 1;
  }

  private clearBots(): void {
    for (const competitor of this.competitors) {
      if (competitor.isBot && competitor.node.isValid) competitor.node.destroy();
    }
    this.competitors.length = 0;
  }

  onDestroy(): void {
    this.stopMatch();
  }
}
