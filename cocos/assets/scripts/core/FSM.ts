/**
 * 强类型有限状态机 (FSM.ts)
 */

export interface IFSMStateHandlers<TState extends string> {
  enter?: (fromState: TState | null, ...args: unknown[]) => void;
  update?: (dt: number, timeInState: number) => void;
  exit?: (fromState: TState, toState: TState) => void;
}

export class FSM<TState extends string> {
  private owner: unknown;
  private currentState: TState;
  private previousState: TState | null = null;
  private states: Map<TState, IFSMStateHandlers<TState>> = new Map();
  private timeInState: number = 0;

  constructor(initialState: TState, owner: unknown = null) {
    this.currentState = initialState;
    this.owner = owner;
  }

  public registerState(name: TState, handlers: IFSMStateHandlers<TState>): this {
    this.states.set(name, handlers);
    return this;
  }

  public setState(newState: TState, ...args: unknown[]): boolean {
    if (this.currentState === newState) return false;
    const currentHandler = this.states.get(this.currentState);
    if (currentHandler && currentHandler.exit) {
      currentHandler.exit.call(this.owner, this.currentState, newState);
    }

    this.previousState = this.currentState;
    this.currentState = newState;
    this.timeInState = 0;

    const nextHandler = this.states.get(newState);
    if (nextHandler && nextHandler.enter) {
      nextHandler.enter.call(this.owner, this.previousState, ...args);
    }
    return true;
  }

  public update(dt: number): void {
    this.timeInState += dt;
    const handler = this.states.get(this.currentState);
    if (handler && handler.update) {
      handler.update.call(this.owner, dt, this.timeInState);
    }
  }

  public is(stateName: TState): boolean {
    return this.currentState === stateName;
  }

  public getState(): TState {
    return this.currentState;
  }
}
