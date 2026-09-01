/**
 * 编辑器保存的 UI 页面路由。
 *
 * 这个组件只管理已经由 Cocos Creator 保存到场景/预制体中的节点；它不会在运行时
 * 新建 Node、Label、Button 或 Graphics。页面视觉和控件均应由设计师/编辑器产出。
 */
import { _decorator, Component, Enum, Node } from 'cc';

const { ccclass, property } = _decorator;

export enum UIPageId {
  Home = 0,
  ModeSelect = 1,
  Arena = 2,
  Endless = 3,
  Revive = 4,
  Settlement = 5,
  Pause = 6,
  Upgrade = 7,
}

@ccclass('UIPage')
export class UIPage extends Component {
  @property({ type: Enum(UIPageId), tooltip: '该节点所代表的正式 UI 页面。' })
  public pageId = UIPageId.Home;

  @property({ type: Node, tooltip: '实际显示/隐藏的页面根节点；留空时使用当前节点。' })
  public pageRoot: Node | null = null;

  public setVisible(visible: boolean): void {
    (this.pageRoot ?? this.node).active = visible;
  }
}

@ccclass('UIPageRouter')
export class UIPageRouter extends Component {
  @property({ type: [UIPage], tooltip: '由编辑器拖入的页面组件，禁止通过代码构造。' })
  public pages: UIPage[] = [];

  @property({ type: Enum(UIPageId), tooltip: '进入该 UI 根节点时首先显示的页面。' })
  public initialPage = UIPageId.Home;

  public activePage: UIPageId | null = null;

  onLoad(): void {
    if (this.pages.length > 0) {
      this.show(this.initialPage);
    }
  }

  /**
   * 切换至一个已经在编辑器中登记的页面。
   * 未登记页面不会静默创建替代品，调用方可据此暴露配置错误。
   */
  public show(pageId: UIPageId): boolean {
    const target = this.pages.find((page) => page && page.pageId === pageId);
    if (!target) {
      return false;
    }

    for (const page of this.pages) {
      if (page) {
        page.setVisible(page === target);
      }
    }

    this.activePage = pageId;
    return true;
  }
}
