/**
 * 由 Cocos Creator 保存到场景或预制体上的单个 UI 页面。
 *
 * 一个 Component 脚本文件只声明一个 Cocos 组件，避免编辑器脚本导入错误。
 */
import { _decorator, Component, Enum, Node } from 'cc';
import { UIPageId } from './UIPageId';

const { ccclass, property } = _decorator;

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
