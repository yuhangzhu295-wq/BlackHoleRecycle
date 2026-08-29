/**
 * 状态机 (Finite State Machine)
 * 支持状态切换、生命周期 enter/update/exit 与状态守卫
 */
export class FSM {
  constructor(initialState = 'IDLE', owner = null) {
    this.owner = owner;
    this.currentState = initialState;
    this.previousState = null;
    this.states = new Map();
    this.timeInState = 0;
  }

  registerState(name, handlers = {}) {
    this.states.set(name, {
      enter: handlers.enter || (() => {}),
      update: handlers.update || (() => {}),
      exit: handlers.exit || (() => {})
    });
    return this;
  }

  setState(newState, ...args) {
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

  update(dt) {
    this.timeInState += dt;
    const handler = this.states.get(this.currentState);
    if (handler && handler.update) {
      handler.update.call(this.owner, dt, this.timeInState);
    }
  }

  is(stateName) {
    return this.currentState === stateName;
  }

  getState() {
    return this.currentState;
  }
}
