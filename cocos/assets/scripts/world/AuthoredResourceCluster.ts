import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('AuthoredResourceCluster')
export class AuthoredResourceCluster extends Component {
  @property
  public clusterId: string = '';

  @property({ type: Node })
  public spawnGroup: Node | null = null;

  @property({ type: Node })
  public anchorNode: Node | null = null;
}
