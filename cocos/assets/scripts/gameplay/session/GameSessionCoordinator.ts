/**
 * The session coordinator is the single owner of player-facing application
 * state. It deliberately has no Cocos Component or Node dependency: it is a
 * small application service owned by the scene-saved GameManager.
 *
 * UI controllers may subscribe to its events, while gameplay systems receive
 * only the state they need from GameManager. This prevents page visibility,
 * pause semantics and mode selection from becoming a second world authority.
 */

export type GameSessionState =
  | 'HOME'
  | 'MODE_SELECT'
  | 'MACHINE_INFO'
  | 'SKIN_SELECTION'
  | 'PLAYING'
  | 'ARENA'
  | 'NETWORK_ARENA'
  | 'REVIVING'
  | 'PAUSED'
  | 'SETTLEMENT';

export type GameplaySessionState = 'PLAYING' | 'ARENA' | 'NETWORK_ARENA';
export type GameSessionMode = 'ENDLESS' | 'ARENA';

export interface GameSessionTransition {
  readonly previous: GameSessionState;
  readonly current: GameSessionState;
  readonly reason: string;
  readonly pausedGameplayState: GameplaySessionState;
  readonly lastSessionMode: GameSessionMode;
  readonly isPaused: boolean;
}

export type GameSessionListener = (transition: GameSessionTransition) => void;

/**
 * Explicit transition table makes the supported player journey reviewable.
 * Restarting a completed run is intentionally allowed from SETTLEMENT; all
 * other gameplay mutations remain in their respective gameplay authorities.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<GameSessionState, readonly GameSessionState[]>> = {
  HOME: ['MODE_SELECT', 'MACHINE_INFO', 'SKIN_SELECTION', 'PLAYING', 'ARENA', 'NETWORK_ARENA'],
  MODE_SELECT: ['HOME', 'PLAYING', 'ARENA', 'NETWORK_ARENA'],
  MACHINE_INFO: ['HOME'],
  SKIN_SELECTION: ['HOME'],
  PLAYING: ['PAUSED', 'SETTLEMENT', 'HOME'],
  ARENA: ['PAUSED', 'REVIVING', 'SETTLEMENT', 'HOME'],
  NETWORK_ARENA: ['PAUSED', 'SETTLEMENT', 'HOME'],
  REVIVING: ['ARENA', 'SETTLEMENT', 'HOME'],
  PAUSED: ['PLAYING', 'ARENA', 'NETWORK_ARENA', 'SETTLEMENT', 'HOME'],
  SETTLEMENT: ['HOME', 'PLAYING', 'ARENA', 'NETWORK_ARENA'],
};

export class GameSessionCoordinator {
  private readonly listeners = new Set<GameSessionListener>();
  private _state: GameSessionState = 'HOME';
  private _pausedGameplayState: GameplaySessionState = 'PLAYING';
  private _lastSessionMode: GameSessionMode = 'ENDLESS';

  public get state(): GameSessionState {
    return this._state;
  }

  public get pausedGameplayState(): GameplaySessionState {
    return this._pausedGameplayState;
  }

  public get lastSessionMode(): GameSessionMode {
    return this._lastSessionMode;
  }

  public get isPaused(): boolean {
    return this._state === 'PAUSED' || this._state === 'SETTLEMENT';
  }

  public subscribe(listener: GameSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public openModeSelect(): boolean {
    return this.transition('MODE_SELECT', 'open-mode-select');
  }

  public openMachineInfo(): boolean {
    return this.transition('MACHINE_INFO', 'open-machine-info');
  }

  public openSkinSelection(): boolean {
    return this.transition('SKIN_SELECTION', 'open-skin-selection');
  }

  public beginEndless(): boolean {
    this._lastSessionMode = 'ENDLESS';
    this._pausedGameplayState = 'PLAYING';
    return this.transition('PLAYING', 'begin-endless');
  }

  public beginArena(networkAuthoritative: boolean): boolean {
    this._lastSessionMode = 'ARENA';
    this._pausedGameplayState = networkAuthoritative ? 'NETWORK_ARENA' : 'ARENA';
    return this.transition(networkAuthoritative ? 'NETWORK_ARENA' : 'ARENA', networkAuthoritative ? 'begin-network-arena' : 'begin-arena');
  }

  public pause(): boolean {
    if (!this.isGameplayState(this._state)) return false;
    this._pausedGameplayState = this._state;
    return this.transition('PAUSED', 'pause');
  }

  public resume(): boolean {
    if (this._state !== 'PAUSED') return false;
    return this.transition(this._pausedGameplayState, 'resume');
  }

  public enterReviving(): boolean {
    return this.transition('REVIVING', 'enter-revive');
  }

  public resumeArenaAfterRevive(): boolean {
    return this.transition('ARENA', 'revive-complete');
  }

  public enterSettlement(reason = 'settlement'): boolean {
    return this.transition('SETTLEMENT', reason);
  }

  public returnHome(): boolean {
    return this.transition('HOME', 'return-home');
  }

  /**
   * This is retained for narrow integration paths that must restore a real
   * replicated session state. It still validates the transition and emits the
   * same immutable event consumed by UI/application observers.
   */
  public transition(next: GameSessionState, reason: string): boolean {
    const previous = this._state;
    if (previous === next) return true;
    if (!ALLOWED_TRANSITIONS[previous].includes(next)) {
      console.error(`[GameSessionCoordinator] Invalid transition ${previous} -> ${next} (${reason}).`);
      return false;
    }

    this._state = next;
    const transition: GameSessionTransition = {
      previous,
      current: next,
      reason,
      pausedGameplayState: this._pausedGameplayState,
      lastSessionMode: this._lastSessionMode,
      isPaused: this.isPaused,
    };
    // Do not spread this Set here. Cocos Creator's current Web Mobile Babel
    // output rewrites `[...set]` as `[].concat(set)`, then attempts to call
    // the Set object as if it were a listener. Set.forEach is native in every
    // supported runtime and preserves the coordinator's subscription contract.
    this.listeners.forEach((listener) => listener(transition));
    return true;
  }

  private isGameplayState(state: GameSessionState): state is GameplaySessionState {
    return state === 'PLAYING' || state === 'ARENA' || state === 'NETWORK_ARENA';
  }
}
