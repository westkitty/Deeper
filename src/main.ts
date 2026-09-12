/**
 * DEEPER — bootstrap.
 */

import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";
import "./style.css";

// restore settings early so the scene picks them up
try {
  const s = JSON.parse(localStorage.getItem("deeper.settings") ?? "{}");
  const w = window as unknown as { deeperSettings?: unknown };
  w.deeperSettings = s;
} catch {
  // defaults
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#0a0a10",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, WorldScene],
});

(window as unknown as { deeperGame?: Phaser.Game }).deeperGame = game;

export default game;
