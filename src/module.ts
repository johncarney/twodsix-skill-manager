import { MODULE_ID, injectSkillSearch, clearCompendiumCache } from "./skill-search.ts";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing module`);

  (game as Game).settings.register(MODULE_ID, "compendiumSource", {
    name: "Skill Compendium Source",
    hint: "The compendium pack ID to search for skills (e.g. twodsix.ce-light-items).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => clearCompendiumCache(),
  });
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Module ready`);
});

// Hook into all twodsix actor sheets that have a skills tab.
// ApplicationV2 fires render<ClassName> with signature (app, element, context, options).
const ACTOR_SHEET_HOOKS = [
  "renderTwodsixTravellerSheet",
  "renderTwodsixNPCSheet",
  "renderTwodsixRobotSheet",
  "renderTwodsixAnimalSheet",
];

for (const hookName of ACTOR_SHEET_HOOKS) {
  Hooks.on(hookName, (_app: unknown, html: HTMLElement) => {
    // html is the root element of the rendered sheet
    const actor = (_app as { document: Actor }).document;
    if (!actor) return;
    injectSkillSearch(actor, html);
  });
}
