import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

export type VehicleKind = 'sedan' | 'garbage_truck' | 'delivery_van';

@ccclass('AuthoredTrafficRoute')
export class AuthoredTrafficRoute extends Component {
  @property
  public routeId: string = '';

  @property
  public vehicleKind: VehicleKind = 'sedan';

  @property({ type: Node })
  public vehicleAnchor: Node | null = null;

  @property({ type: [Node] })
  public waypoints: Node[] = [];

  @property
  public speed: number = 4.0;
}
