const fs = require("fs");
let content = fs.readFileSync("assets/scripts/gameplay/CompressibleObject.ts", "utf8");

const newFunc = `  private applyTemplateMesh(): void {
    if (!this.visualNode) return;
    this.visualNode.removeAllChildren();

    const t = this.template;

    if (t.type === 'soda_can' || t.type === 'water_bottle' || t.type === 'battery') {
      const node = new Node('Body');
      this.visualNode.addChild(node);
      const h = t.height || 0.5;
      const mesh = MeshFactory.getCylinderMesh(t.radius, t.radius, h);
      this.meshRenderer = MeshFactory.attachMesh(node, mesh, t.color, 0.5, 0.3);

      if (t.type === 'soda_can') {
        const top = new Node('Top');
        top.setPosition(0, h / 2 + 0.05, 0);
        this.visualNode.addChild(top);
        MeshFactory.attachMesh(top, MeshFactory.getCylinderMesh(t.radius * 0.8, t.radius * 0.8, 0.1), '#d1d5db', 0.8, 0.8);
      }
    } else if (t.type === 'book_stack') {
      const s = t.size || [0.5, 0.3, 0.5];
      const node = new Node('Book1');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1]*0.6, s[2]), t.color, 0.8, 0.1);
      
      const node2 = new Node('Book2');
      node2.setPosition(0, s[1]*0.6, 0);
      this.visualNode.addChild(node2);
      MeshFactory.attachMesh(node2, MeshFactory.getBoxMesh(s[0]*0.9, s[1]*0.4, s[2]*0.9), '#ffffff', 0.8, 0.1);
    } else if (t.type === 'chair') {
      const s = t.size || [0.8, 1.2, 0.8];
      const node = new Node('Seat');
      node.setPosition(0, s[1]*0.4, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], 0.2, s[2]), t.color, 0.8, 0.1);
      
      const back = new Node('Back');
      back.setPosition(0, s[1]*0.8, -s[2]*0.4);
      this.visualNode.addChild(back);
      MeshFactory.attachMesh(back, MeshFactory.getBoxMesh(s[0], s[1]*0.6, 0.2), t.color, 0.8, 0.1);
    } else if (t.type === 'small_table') {
      const s = t.size || [1.5, 0.6, 1.0];
      const node = new Node('Top');
      node.setPosition(0, s[1], 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], 0.1, s[2]), t.color, 0.7, 0.1);
    } else if (t.type === 'monitor') {
      const s = t.size || [1.2, 0.8, 0.3];
      const node = new Node('Screen');
      node.setPosition(0, s[1]*0.5, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1], s[2]), t.color, 0.5, 0.8);
    } else if (t.type === 'shelf') {
      const s = t.size || [2.5, 3.5, 1.0];
      const node = new Node('Frame');
      node.setPosition(0, s[1]*0.5, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1], s[2]), t.color, 0.5, 0.9);
    } else if (t.type === 'car') {
      const s = t.size || [2.5, 1.5, 4.5];
      const node = new Node('Chassis');
      node.setPosition(0, s[1]*0.3, 0);
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1]*0.6, s[2]), t.color, 0.3, 0.8);
      
      const top = new Node('Top');
      top.setPosition(0, s[1]*0.8, -s[2]*0.1);
      this.visualNode.addChild(top);
      MeshFactory.attachMesh(top, MeshFactory.getBoxMesh(s[0]*0.9, s[1]*0.4, s[2]*0.5), '#111111', 0.2, 0.9);
    } else if (t.shape === ObjectShape.BOX) {
      const s = t.size || [0.6, 0.5, 0.6];
      const node = new Node('Box');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getBoxMesh(s[0], s[1], s[2]), t.color, 0.9, 0.0);
    } else if (t.shape === ObjectShape.CONE) {
      const node = new Node('Cone');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getConeMesh(t.radius, t.height || 0.7), t.color, 0.6, 0.1);
      
      const base = new Node('Base');
      base.setPosition(0, - (t.height || 0.7) / 2, 0);
      this.visualNode.addChild(base);
      MeshFactory.attachMesh(base, MeshFactory.getBoxMesh(t.radius*2.2, 0.1, t.radius*2.2), '#ffffff', 0.6, 0.1);
    } else {
      const node = new Node('Default');
      this.visualNode.addChild(node);
      this.meshRenderer = MeshFactory.attachMesh(node, MeshFactory.getSphereMesh(t.radius), t.color, 0.5, 0.1);
    }
  }`;

content = content.replace(/  private applyTemplateMesh\(\): void \{[\s\S]*?\}\n\n  public getState/s, newFunc + "\n\n  public getState");
fs.writeFileSync("assets/scripts/gameplay/CompressibleObject.ts", content);
