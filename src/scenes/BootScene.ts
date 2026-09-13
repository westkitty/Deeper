/**
 * DEEPER — boot scene: minimal loading, then the world.
 */

import Phaser from "phaser";
import { loadSheets, sliceAll } from "../render/slices";
import { WorldScene } from "./WorldScene";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    loadSheets(this);
  }

  create() {
    sliceAll(this);
    this.scene.start("world");
  }
}
