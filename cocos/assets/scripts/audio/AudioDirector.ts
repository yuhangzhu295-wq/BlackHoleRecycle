/**
 * Sound-effect director.
 *
 * Owns the whole audio policy in one place: which domain event plays which clip,
 * how often a clip may repeat, and whether sound is on. Call sites stay unaware
 * of audio, which is why nothing in `GameManager` or `CompressionSystem` had to
 * grow an `if (audio)` branch -- the director subscribes to the same events
 * those files already emit, and pairs with the haptics that already fire there.
 *
 * ## What is and is not claimed
 *
 * The clips are provisional synthesis (see `generate_audio_sfx.mjs`): they are
 * real and audible, which is what §42 forbids faking, but they are not licensed
 * production audio. `getDiagnostics()` therefore reports `missingPlays` -- the
 * number of times a sound was requested with no clip behind it -- so a build with
 * absent audio cannot look identical to a working one.
 */
import { AudioSource, Node } from 'cc';
import { eventBus } from '../core/EventBus';
import { saveService } from '../data/SaveService';
import { AudioAssetLibrary, AudioClipKey } from './AudioAssetLibrary';

/**
 * Minimum milliseconds between two plays of the same clip.
 *
 * Absorption fires many times a second during a good run, and the swallow sound
 * rides every one of them; without a floor the mix turns into a buzz. Rare cues
 * (upgrade, kill, death) are deliberately unthrottled.
 */
const REPEAT_FLOOR_MS: Readonly<Record<AudioClipKey, number>> = {
  absorb: 70,
  swallow: 70,
  upgrade: 0,
  kill: 0,
  death: 0,
  button: 80,
  reward: 0,
};

/** Per-clip mix level, so the frequent cues sit under the rare ones. */
const CLIP_VOLUME: Readonly<Record<AudioClipKey, number>> = {
  absorb: 0.45,
  swallow: 0.60,
  upgrade: 0.90,
  kill: 0.85,
  death: 0.90,
  button: 0.55,
  reward: 0.85,
};

/**
 * UI events that should click. Listed explicitly rather than matched by suffix,
 * so a new gameplay event cannot accidentally become a button sound.
 */
const BUTTON_EVENTS: readonly string[] = [
  'HOME_START_REQUESTED', 'HOME_MODE_REQUESTED', 'HOME_MACHINE_REQUESTED', 'HOME_SKIN_REQUESTED',
  'MODE_ARENA_REQUESTED', 'MODE_ENDLESS_REQUESTED', 'MODE_BACK_REQUESTED',
  'READY_START_REQUESTED', 'READY_BACK_REQUESTED',
  'MACHINE_INFO_BACK_REQUESTED', 'SKIN_PAGE_BACK_REQUESTED', 'SKIN_PAGE_SELECT_REQUESTED',
  'UI_TRIGGER_PAUSE', 'GAME_TRIGGER_SETTLEMENT', 'GAME_RETURN_HOME', 'GAME_RESTART_CURRENT',
  'ARENA_REVIVE_REQUESTED', 'ARENA_GIVE_UP_REQUESTED',
];

export interface AudioDiagnostics {
  readonly muted: boolean;
  readonly ready: boolean;
  readonly boundClips: readonly string[];
  readonly lastError: string | null;
  readonly plays: number;
  readonly missingPlays: number;
  readonly suppressedByFloor: number;
  readonly lastKey: string | null;
  /**
   * Plays per clip. `lastKey` cannot answer "did this cue ever fire": a click
   * that opens a page emits the button cue after the page's own cue, so the
   * reward sound can be the second-to-last and look absent.
   */
  readonly playCounts: Readonly<Record<string, number>>;
}

export class AudioDirector {
  private source: AudioSource | null = null;
  private host: Node | null = null;
  private readonly lastPlayedAt = new Map<AudioClipKey, number>();
  private readonly playCounts = new Map<AudioClipKey, number>();
  private unbind: Array<() => void> = [];
  private plays = 0;
  private missingPlays = 0;
  private suppressedByFloor = 0;
  private lastKey: string | null = null;

  /** Attach to a scene node and start following the event bus. */
  public attach(host: Node): void {
    if (this.host?.isValid) return;
    this.host = host;
    const node = new Node('AudioDirector');
    node.layer = host.layer;
    host.addChild(node);
    this.source = node.addComponent(AudioSource);

    AudioAssetLibrary.ensure();
    this.bindEvents();
  }

  public detach(): void {
    for (const off of this.unbind) off();
    this.unbind = [];
    if (this.host?.isValid && this.source?.node?.isValid) this.source.node.destroy();
    this.source = null;
    this.host = null;
  }

  private bindEvents(): void {
    const on = (event: string, handler: (...args: unknown[]) => void): void => {
      this.unbind.push(eventBus.on(event, handler, this));
    };

    // Paired with the haptics that already fire at these exact moments.
    on('COMPRESSION_STARTED', () => this.play('absorb'));
    on('OBJECT_ABSORBED', () => this.play('swallow'));
    on('MACHINE_EVOLVED', () => this.play('upgrade'));
    on('ARENA_LOCAL_KILL', () => this.play('kill'));
    on('ARENA_LOCAL_DEFEATED', () => this.play('death'));
    for (const event of BUTTON_EVENTS) on(event, () => this.play('button'));
    // The settlement page opening is the reward moment. Deliberately not a
    // BUTTON_EVENT: that list is the click sound, and this cue is the payoff.
    on('SETTLEMENT_SHOWN', () => this.play('reward'));
  }

  public play(key: AudioClipKey): void {
    if (this.isMuted()) return;
    const clip = AudioAssetLibrary.getClip(key);
    if (!clip || !this.source) {
      // Counted, not swallowed: a build with no audio must not look like a build
      // whose audio simply had nothing to play.
      this.missingPlays += 1;
      return;
    }
    const floor = REPEAT_FLOOR_MS[key];
    const now = Date.now();
    const previous = this.lastPlayedAt.get(key);
    if (floor > 0 && previous !== undefined && now - previous < floor) {
      this.suppressedByFloor += 1;
      return;
    }
    this.lastPlayedAt.set(key, now);
    this.source.playOneShot(clip, CLIP_VOLUME[key]);
    this.plays += 1;
    this.playCounts.set(key, (this.playCounts.get(key) || 0) + 1);
    this.lastKey = key;
  }

  public isMuted(): boolean {
    // The save has declared `settings.sfx` since V1 and nothing ever read it;
    // this is that flag finally doing something.
    return saveService.data.settings.sfx === false;
  }

  /** Flip the persisted mute flag and return the new state. */
  public toggleMuted(): boolean {
    const next = !this.isMuted();
    saveService.setSfxEnabled(!next);
    return next;
  }

  public getDiagnostics(): AudioDiagnostics {
    return {
      muted: this.isMuted(),
      ready: AudioAssetLibrary.isReady(),
      boundClips: AudioAssetLibrary.boundClips(),
      lastError: AudioAssetLibrary.getLastError(),
      plays: this.plays,
      missingPlays: this.missingPlays,
      suppressedByFloor: this.suppressedByFloor,
      lastKey: this.lastKey,
      playCounts: Object.fromEntries(this.playCounts),
    };
  }

}

/**
 * The scene's director. Attached once from `GameManager`, which owns the scene
 * node it hangs off; there is deliberately no lazy creation, so a scene that
 * never calls `installAudioDirector` gets silence plus a null diagnostic rather
 * than an audio node appearing from nowhere.
 */
let shared: AudioDirector | null = null;

export function installAudioDirector(host: Node): AudioDirector {
  if (!shared) {
    shared = new AudioDirector();
    shared.attach(host);
  }
  return shared;
}

export function audioDirector(): AudioDirector | null {
  return shared;
}

export function disposeAudioDirector(): void {
  shared?.detach();
  shared = null;
}
