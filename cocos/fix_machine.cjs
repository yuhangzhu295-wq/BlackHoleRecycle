const fs = require("fs");
let content = fs.readFileSync("assets/scripts/machine/BlackHoleMachine.ts", "utf8");

const evolveLogic = `  private evolve(level: number): void {
    if (level > MACHINE_EVOLUTIONS.length) return;
    this.currentLevel = level;
    this.currentConfig = MACHINE_EVOLUTIONS[level - 1];

    if (this.holeRim) {
      this.holeRim.scale = new Vec3(this.currentConfig.suctionRadius, 1, this.currentConfig.suctionRadius);
    }
    
    // Play structural change animation (jump and scale)
    const pos = this.node.getPosition();
    this.node.setPosition(pos.x, pos.y + 1.0, pos.z);
    
    // Add visual parts based on level to give clear indication
    if (level === 2 && !this.node.getChildByName('Turbines')) {
       const tNode = new Node('Turbines');
       this.node.addChild(tNode);
       const t1 = new Node('T1'); t1.setPosition(-this.currentConfig.suctionRadius*0.8, 0, 0); tNode.addChild(t1);
       const t2 = new Node('T2'); t2.setPosition(this.currentConfig.suctionRadius*0.8, 0, 0); tNode.addChild(t2);
       MeshFactory.attachMesh(t1, MeshFactory.getCylinderMesh(0.5, 0.5, 0.2), '#333333', 0.5, 0.9);
       MeshFactory.attachMesh(t2, MeshFactory.getCylinderMesh(0.5, 0.5, 0.2), '#333333', 0.5, 0.9);
    }
    if (level === 3 && !this.node.getChildByName('Compressor')) {
       const cNode = new Node('Compressor');
       cNode.setPosition(0, 0.5, -this.currentConfig.suctionRadius*0.8);
       this.node.addChild(cNode);
       MeshFactory.attachMesh(cNode, MeshFactory.getBoxMesh(1.5, 1.5, 1.0), '#444444', 0.5, 0.8);
    }
    if (level === 4 && !this.node.getChildByName('GravityRing')) {
       const gNode = new Node('GravityRing');
       gNode.setPosition(0, 1.5, 0);
       this.node.addChild(gNode);
       MeshFactory.attachMesh(gNode, MeshFactory.getCylinderMesh(this.currentConfig.suctionRadius*1.2, this.currentConfig.suctionRadius*1.1, 0.2), '#00e5ff', 0.1, 0.5);
    }

    eventBus.emit('MACHINE_EVOLVED', { level: this.currentLevel, config: this.currentConfig });
  }`;

content = content.replace(/  private evolve\(level: number\): void \{[\s\S]*?\}\n\n  public checkSuction/s, evolveLogic + "\n\n  public checkSuction");

fs.writeFileSync("assets/scripts/machine/BlackHoleMachine.ts", content);
