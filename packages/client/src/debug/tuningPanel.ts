/**
 * Live tuning panel (Tweakpane). Every slider edits the shared tuning object directly;
 * the scene picks the change up on the next simulation step.
 */
import { Pane } from "tweakpane";
import { deriveMovement, type MovementTuning, type CameraTuning } from "../config";
import { debugView, liveStats } from "./debugState";
import { resetTuning, saveTuning, tuning } from "../tuningStore";

type Range = { label: string; min: number; max: number; step: number };

const MOVEMENT_FIELDS: Array<[keyof MovementTuning, Range]> = [
  ["runSpeed", { label: "vitesse (cases/s)", min: 2, max: 15, step: 0.1 }],
  ["groundAccel", { label: "accél. au sol", min: 10, max: 400, step: 1 }],
  ["groundDecel", { label: "freinage au sol", min: 10, max: 400, step: 1 }],
  ["airAccel", { label: "accél. en l'air", min: 5, max: 400, step: 1 }],
  ["airDecel", { label: "freinage en l'air", min: 0, max: 400, step: 1 }],
];

const JUMP_FIELDS: Array<[keyof MovementTuning, Range]> = [
  ["jumpHeight", { label: "hauteur (cases)", min: 1, max: 6, step: 0.05 }],
  ["timeToApex", { label: "temps de montée (s)", min: 0.15, max: 0.8, step: 0.005 }],
  ["fallGravityMultiplier", { label: "gravité en chute ×", min: 0.5, max: 4, step: 0.05 }],
  ["jumpCutGravityMultiplier", { label: "gravité saut court ×", min: 1, max: 8, step: 0.1 }],
  ["maxFallSpeed", { label: "chute max (cases/s)", min: 5, max: 40, step: 0.5 }],
  ["coyoteTime", { label: "coyote time (s)", min: 0, max: 0.3, step: 0.005 }],
  ["jumpBufferTime", { label: "mémoire du saut (s)", min: 0, max: 0.3, step: 0.005 }],
  ["cornerCorrection", { label: "correction de coin", min: 0, max: 0.5, step: 0.01 }],
];

const WALL_FIELDS: Array<[keyof MovementTuning, Range]> = [
  ["wallSlideSpeed", { label: "glisse max (cases/s)", min: 0.5, max: 15, step: 0.1 }],
  ["wallJumpHeight", { label: "hauteur saut mural", min: 0.5, max: 5, step: 0.05 }],
  ["wallJumpSpeedX", { label: "poussée du mur", min: 1, max: 20, step: 0.1 }],
  ["wallJumpControlLock", { label: "blocage après saut (s)", min: 0, max: 0.4, step: 0.005 }],
  ["wallCoyoteTime", { label: "coyote mural (s)", min: 0, max: 0.3, step: 0.005 }],
];

const BODY_FIELDS: Array<[keyof MovementTuning, Range]> = [
  ["bodyWidth", { label: "largeur (cases)", min: 0.3, max: 1, step: 0.05 }],
  ["bodyHeight", { label: "hauteur (cases)", min: 0.3, max: 1.9, step: 0.05 }],
];

const CAMERA_FIELDS: Array<[keyof CameraTuning, Range]> = [
  ["lookAhead", { label: "regard en avant (cases)", min: 0, max: 10, step: 0.1 }],
  ["lookAheadSpeed", { label: "vitesse du regard", min: 0.2, max: 15, step: 0.1 }],
  ["lookAheadTurnDelay", { label: "délai demi-tour (s)", min: 0, max: 1, step: 0.01 }],
  ["followSpeedX", { label: "suivi horizontal", min: 0.5, max: 30, step: 0.1 }],
  ["followSpeedY", { label: "suivi vertical", min: 0.5, max: 30, step: 0.1 }],
  ["deadZoneX", { label: "zone morte horizontale", min: 0, max: 6, step: 0.1 }],
  ["deadZoneY", { label: "zone morte verticale", min: 0, max: 6, step: 0.1 }],
];

export function createTuningPanel(onChange: () => void): Pane {
  const pane = new Pane({ title: "Réglages (Tab pour masquer)" });

  const derivedView = { jumpLength: 0, gravity: 0 };
  const refreshDerived = () => {
    const d = deriveMovement(tuning.movement);
    derivedView.jumpLength = d.jumpLength;
    derivedView.gravity = d.gravity;
  };
  refreshDerived();

  const live = pane.addFolder({ title: "En direct" });
  live.addBinding(liveStats, "state", { label: "état", readonly: true });
  live.addBinding(liveStats, "vx", { label: "vx", readonly: true, format: (v: number) => v.toFixed(2) });
  live.addBinding(liveStats, "vy", { label: "vy", readonly: true, format: (v: number) => v.toFixed(2) });
  live.addBinding(derivedView, "jumpLength", {
    label: "longueur de saut",
    readonly: true,
    format: (v: number) => `${v.toFixed(2)} cases`,
  });

  const addFields = <T extends object>(title: string, target: T, fields: Array<[keyof T, Range]>, expanded = true) => {
    const folder = pane.addFolder({ title, expanded });
    for (const [key, range] of fields) folder.addBinding(target, key, range);
  };
  addFields("Course", tuning.movement, MOVEMENT_FIELDS, false);
  addFields("Saut", tuning.movement, JUMP_FIELDS);
  addFields("Mur", tuning.movement, WALL_FIELDS, false);
  addFields("Caméra", tuning.camera, CAMERA_FIELDS, false);
  addFields("Corps", tuning.movement, BODY_FIELDS, false);

  const view = pane.addFolder({ title: "Affichage", expanded: false });
  view.addBinding(debugView, "showTrail", { label: "trajectoire" });
  view.addBinding(debugView, "showGrid", { label: "grille" });
  view.addBinding(debugView, "showHud", { label: "aide" });

  pane.addButton({ title: "Copier la config" }).on("click", () => {
    const text = JSON.stringify(tuning, null, 2);
    navigator.clipboard?.writeText(text).catch(() => console.log(text));
    console.log(text);
  });
  pane.addButton({ title: "Valeurs par défaut" }).on("click", () => {
    resetTuning();
    pane.refresh();
    refreshDerived();
    onChange();
  });

  pane.on("change", () => {
    refreshDerived();
    saveTuning();
    onChange();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Tab") {
      e.preventDefault();
      pane.hidden = !pane.hidden;
    }
  });

  return pane;
}
