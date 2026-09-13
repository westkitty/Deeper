/**
 * DEEPER — authored landmark prefabs injected into generated terrain.
 * Landmarks give players mental maps and carry the wow beats. Chars map to
 * materials/entities at injection time (see worldgen).
 *
 * Legend (walls/fill use material letters, see code):
 *   .  keep generated terrain      ' ' force open (air)
 *   Letters: s soil, c clay, n sandstone, S stone, t timber, r railiron, k coalrock
 *   C concrete, B brick, A asphalt, L steel, u conduit, i tile
 *   w wetstone, p pressglass, l slate, a calcite
 *   b basalt, y sulfurrock, o obsidian, m magmarock
 *   X crystal, d darkstone, G gemrock
 *   M composite, Y alloy, P cpipe, K bulkhead, D decpanel
 *   V vaultwall, E geodeshell, H rootgold (amber heartwood), g grass
 * Entities (injected after terrain):
 *   v lift landing   $ loot cache (rich)   % relic   & blueprint   ^ motherlode seed
 *   @ gas pocket     ~ water source        = oil     ! magma source
 *   Q machine salvage (large salvage)      T threat spawner (family by stratum)
 *   W wow trigger anchor (WOW-04 excavator)  R resonance node anchor
 *   Z deep engine core   F reservoir valve
 */

export interface LandmarkDef {
  key: string;
  name: string;
  stratum: string;
  /** Fixed world position (x) if anchored, otherwise seeded scatter. */
  x?: number;
  /** Chance to place when seeding (seeded scatter uses count). */
  count?: number;
  rows: string[];
  /** Fired when player first enters its footprint radius. */
  reveal?: string; // wow event key
}

export const LANDMARKS: LandmarkDef[] = [
  // ---------------------------------------------------------------- SURFACE
  {
    key: "works", name: "The Works", stratum: "surface", x: 24, rows: [
      "....WWW....",
      "..########.",
      ".##########",
    ],
  },
  // ---------------------------------------------------------------- ROOTBED
  {
    key: "cellar", name: "Collapsed cellar", stratum: "rootbed", count: 3, rows: [
      "tttttttt",
      "t      t",
      "t %  $ t",
      "t  ss  t",
      "ttsssstt",
    ],
  },
  {
    key: "oldpipes", name: "Municipal pipe run", stratum: "rootbed", count: 3, rows: [
      "pppppppppppp",
      "6pp666pp66pp",
      ".s.s..s..s.s",
    ],
  },
  {
    key: "firstvein", name: "Mother copper vein", stratum: "rootbed", x: 44, rows: [
      ".....nn.....",
      "..##CC##....",
      ".#CCCCCC#...",
      "..##CC##....",
      ".....nn.....",
    ],
  },
  {
    key: "sealvault", name: "Sealed vault (surface class)", stratum: "rootbed", x: 92, rows: [
      "..CCCCCCCC..",
      ".CVVVVVVVVC.",
      ".V $ $ $ $V.",
      ".V  & % $ V.",
      ".CVVVVVVVVC.",
      "..CCCCCCCC..",
    ],
  },
  {
    key: "fossilbed", name: "Fossil bed", stratum: "rootbed", count: 2, rows: [
      "ssss%ssss",
      "ssH%HH%ss",
      "sss%H%sss",
    ],
  },
  // ---------------------------------------------------------------- OLD WORKS
  {
    key: "minestation", name: "Collapsed mine station", stratum: "oldworks", x: 40, rows: [
      "SSSSSSSSSSSSSS",
      "StttttttttttsS",
      "St rrrrrrrr sS",
      "St r      r sS",
      "St r $ &  r sS",
      "St r  T   r sS",
      "SSSSSSSSSSSSSS",
    ],
  },
  {
    key: "railhub", name: "Rail junction", stratum: "oldworks", count: 2, rows: [
      "..............",
      "rrrrrrrrrrrrrr",
      ".S.S....S.S...",
      "..$........%..",
    ],
  },
  {
    key: "excavator", name: "THE BURIED EXCAVATOR", stratum: "oldworks", x: 100, reveal: "wow04", rows: [
      "................................................",
      "......LLLLLLLL..............LLLLLLLL............",
      "..LLLLLYYYYYYLLLL....LLLLLLLYYYYYYYYLLLLL......",
      ".LYYYYYDDDDDDYYYYLLLYYYYYYYDDDDDDDDDYYYYYLL....",
      "LYDDMMMMMMMMMMDDYYYYYYDDMMMMMMMMMMMMMDDYYYL....",
      "LYDMuuMMMMMMuuDMYYYYYDMuuMMMMMMuuMMMDMYYYL.....",
      "LYDMu$MMMMMMu$DMYYYYYDMu%MMMMMM%uMMDMYYL.......",
      "LYDDMMMMMMMMMMDDYYYYYYDDMMMMMMMMMMMMMDDYL......",
      ".LYYYYDDDDDDYYYYLLLYYYYYYYDDDDDDDDDYYYYYL......",
      "..LLLLLYYYYYYLLLL....LLLLLLLYYYYYYLLLLL........",
      "......LLLLLLLL..............LLLLLLLL...........",
    ],
  },
  {
    key: "liftA", name: "Rootbed lift landing", stratum: "rootbed", x: 25, rows: [
      "SSvvSS",
      "SSvvSS",
      "SSvvSS",
      "SSvvSS",
    ],
  },
  {
    key: "liftB", name: "Old Works lift landing", stratum: "oldworks", x: 25, rows: [
      "SSvvSS",
      "SSvvSS",
      "SSvvSS",
      "SSvvSS",
    ],
  },
  // ---------------------------------------------------------------- BURIED MILE
  {
    key: "subway", name: "Subway platform", stratum: "buriedmile", x: 56, rows: [
      "CCCCCCCCCCCCCCCCCCCC",
      "CiiiiiiiiiiiiiiiiiiC",
      "C %    T      $    C",
      "CuuuuuuuuuuuuuuuuuuC",
      "CBBBBBBBBBBBBBBBBBBC",
      "CCCCCCCCCCCCCCCCCCCC",
    ],
  },
  {
    key: "parking", name: "Buried parking structure", stratum: "buriedmile", count: 2, rows: [
      "CLCCCCCCCLCCCCCCCLC",
      "C........C........C",
      "CLCCCCCCCLCCCCCCCLC",
      "C........C....%...C",
      "CLCCCCCCCLCCCCCCCLC",
    ],
  },
  {
    key: "utilityroom", name: "Utility room", stratum: "buriedmile", count: 3, rows: [
      "CCCCCCCC",
      "Cuu$$uuC",
      "C  T   C",
      "CCCCCCCC",
    ],
  },
  {
    key: "bankvault", name: "FIRST NATIONAL VAULT", stratum: "buriedmile", x: 112, reveal: "wow05_site", rows: [
      "....................",
      "...VVVVVVVVVVVVV....",
      "..VCCCCCCCCCCCCV....",
      "..VC          CV....",
      "..VC $$ $ $ $ CV....",
      "..VC  &    %  CV....",
      "..VC $ $ $$ $ CV....",
      "..VCCCCCCCCCCCCV....",
      "...VVVVVVVVVVVVV....",
      "....................",
    ],
  },
  {
    key: "liftC", name: "Buried Mile lift landing", stratum: "buriedmile", x: 25, rows: [
      "CCvvCC",
      "CCvvCC",
      "CCvvCC",
      "CCvvCC",
    ],
  },
  // ---------------------------------------------------------------- DROWNED FAULT
  {
    key: "reservoir", name: "The Great Reservoir", stratum: "drownedfault", x: 80, reveal: "wow06_site", rows: [
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
      "w~~~~~~~~~~~~~~~~~~~~~~~~~~~~w", // water sources along top
      "w~~~~~~~~~~~~~~~~~~~~~~~~~~~~w",
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
    ],
  },
  {
    key: "pumproom", name: "Drainage pump room", stratum: "drownedfault", x: 116, reveal: "wow06", rows: [
      "LLLLLLLLLLLL",
      "LuuuuuuuuuuL",
      "Lu ==  == uL",
      "Lu F==== &uL",
      "LuuuuuuuuuuL",
      "LLLLLLLLLLLL",
    ],
  },
  {
    key: "floodedruins", name: "Flooded ruins", stratum: "drownedfault", count: 3, rows: [
      "..BB....BB..",
      "..B %$$ % B..",
      "..B.......B..",
      "..B.. ~ ..B..",
      "..BBBB..BBB..",
    ],
  },
  {
    key: "sunkenbell", name: "The Sunken Bell", stratum: "drownedfault", x: 80, reveal: "wow06_bell", rows: [
      "....aaaa....",
      "...a    a...",
      "..a  %%  a..",
      "..a %$$% a..",
      "...a    a...",
      "....aaaa....",
    ],
  },
  {
    key: "liftD", name: "Drowned Fault lift landing", stratum: "drownedfault", x: 25, rows: [
      "LLvvLL",
      "LLvvLL",
      "LLvvLL",
      "LLvvLL",
    ],
  },
  // ---------------------------------------------------------------- RED FAULT
  {
    key: "gaschamber", name: "The Powder Room", stratum: "redfault", x: 60, reveal: "wow07_site", rows: [
      "oooooooooooooooooooo",
      "o@@@@@@@@oooooooooo",
      "o@@@@@@@@oooooooooo",
      "oyyyyyyyyyyoooooooo",
      "o=yyyy=====oooooooo",
      "oyy!!yyy==ooooooooo",
      "o==$$==%%%%%%%%oooo",
      "oooooooooo!!!!!!!!o",
      "oooooooooooooooooooo",
    ],
  },
  {
    key: "magmachamber", name: "Magma chamber", stratum: "redfault", count: 3, rows: [
      "bbbbbbbbbbbbb",
      "b!!!!!!!!!!!b",
      "bmmmmmmmmmmmb",
      "bbbbbbbbbbbb b",
    ],
  },
  {
    key: "forge", name: "Buried forge", stratum: "redfault", count: 2, rows: [
      "MMMMMMMMMM",
      "M $%%%$  M",
      "M   T    M",
      "MMmmmmmmMM",
    ],
  },
  {
    key: "liftE", name: "Red Fault lift landing", stratum: "redfault", x: 25, rows: [
      "YYvvYY",
      "YYvvYY",
      "YYvvYY",
      "YYvvYY",
    ],
  },
  // ---------------------------------------------------------------- GLASS CHOIR
  {
    key: "cathedral", name: "THE GLASS CATHEDRAL", stratum: "glasschoir", x: 76, reveal: "wow08_site", rows: [
      ".......XX...............XX.......",
      "......XXXX.............XXXX......",
      ".....XXXXXX...........XXXXXX.....",
      "....XXXXXXXX.........XXXXXXXX....",
      "...XXXXXXXXXX.R....RXXXXXXXXXX...",
      "..XXXXXXXXXXXXXX..XXXXXXXXXXXXX..",
      ".XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXddXXGGXXddXXGGXXddXXGGXXddXXGGX",
      "XXddXXGGXXddXXGGXXddXXGGXXddXXGGX",
    ],
  },
  {
    key: "shardfield", name: "Shard field", stratum: "glasschoir", count: 3, rows: [
      "..X..XX..X..",
      ".XXX.XX.XXX.",
      "..XXRR.XX...",
    ],
  },
  {
    key: "geodegrove", name: "Geode grove", stratum: "glasschoir", count: 2, rows: [
      "...EE...EE...",
      "..E%%EE%%$E..",
      "...EE...EE...",
    ],
  },
  {
    key: "liftF", name: "Glass Choir lift landing", stratum: "glasschoir", x: 25, rows: [
      "XXvvXX",
      "XXvvXX",
      "XXvvXX",
      "XXvvXX",
    ],
  },
  // ---------------------------------------------------------------- ENGINE DEEP
  {
    key: "coolingchamber", name: "Machine cooling chamber", stratum: "enginedeep", count: 2, rows: [
      "KKKKKKKKKKKK",
      "KDDPPDDPPDDK",
      "K ~~~~~~~~ K",
      "KDDPPDDPPDDK",
      "K Q $ %    K",
      "KKKKKKKKKKKK",
    ],
  },
  {
    key: "bulkheadgate", name: "The Sealed Bulkhead", stratum: "enginedeep", x: 84, reveal: "wow11_site", rows: [
      "MMMMMMMMMMMMMMMMMM",
      "MMMMKKKKKKKKKKMMMM",
      "MMMMD  K  K  DMMMM",
      "MMMMK & $%$  KMMMM",
      "MMMMKKKKKKKKKKMMMM",
      "MMMMMMMMMMMMMMMMMM",
    ],
  },
  {
    key: "machineheart", name: "The Deep Engine", stratum: "enginedeep", x: 76, reveal: "wow12_site", rows: [
      "..........................................",
      "...DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD....",
      "..DYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYD...",
      "..DYY  DD  DD  DD  DD  DD  DD  DD  YYD...",
      "..DYY D  D D  D D  D D  D D  D D  YYD...",
      "..DYY   ZZ   D    T     D     D   YYD...",
      "..DYY D  D D  D D  D D  D D  D D  YYD...",
      "..DYY  DD  DD  DD  DD  DD  DD  DD  YYD...",
      "..DYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYD...",
      "...DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD....",
      "..........................................",
    ],
  },
  {
    key: "liftG", name: "Engine Deep lift landing", stratum: "enginedeep", x: 25, rows: [
      "MMvvMM",
      "MMvvMM",
      "MMvvMM",
      "MMvvMM",
    ],
  },
];

/** By-stratum lookup for worldgen. */
export function landmarksFor(stratum: string): LandmarkDef[] {
  return LANDMARKS.filter((l) => l.stratum === stratum);
}
