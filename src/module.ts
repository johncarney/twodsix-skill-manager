import { MODULE_ID, injectSkillSearch, clearCompendiumCache, getActorSkills, getGroupValue } from "./skill-search.ts";
import type { SkillSystem } from "./skill-search.ts";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing module`);

  Hooks.on("preUpdateItem", (item: Item, changes: Record<string, unknown>) => {
    if (item.type !== "skills") return;
    if (!item.parent || item.parent.documentName !== "Actor") return;
    if (item.getFlag("twodsix", "untrainedSkill")) return;

    const systemChanges = changes.system as { value?: number } | undefined;
    if (systemChanges?.value === undefined || systemChanges.value >= 0) return;

    const system = item.system as unknown as SkillSystem;
    if (!system.groupLabel) return;

    const actor = item.parent as Actor;
    const actorSkills = getActorSkills(actor);
    const value = getGroupValue(system.groupLabel, actorSkills);

    if (value !== systemChanges.value) {
      systemChanges.value = value;
    }
  });

  Hooks.on("updateItem", (item: Item, changes: Record<string, unknown>) => {
    if (item.type !== "skills") return;
    if (!item.parent || item.parent.documentName !== "Actor") return;
    if (item.getFlag("twodsix", "untrainedSkill")) return;

    const systemChanges = changes.system as { value?: number } | undefined;
    if (systemChanges?.value === undefined || systemChanges.value < 0) return;

    const system = item.system as unknown as SkillSystem;
    if (!system.groupLabel) return;

    const actor = item.parent as Actor;
    const siblings = getActorSkills(actor).filter((s) => {
      const sys = s.system as unknown as SkillSystem;
      return s.id !== item.id && sys.groupLabel === system.groupLabel && sys.value < 0;
    });

    if (siblings.length > 0) {
      const updates = siblings.map((s) => ({ _id: s.id, "system.value": 0 }));
      void actor.updateEmbeddedDocuments("Item", updates);
    }
  });

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

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | Module ready`);

  // Populate compendiumSource choices with packs that contain skill items
  console.log(`${MODULE_ID} | Building compendium choices…`);
  console.time(`${MODULE_ID} | Compendium choices`);

  const packs = (game as Game).packs;
  const skillPacks: { collection: string; label: string }[] = [];
  if (packs) {
    for (const pack of packs) {
      if (pack.metadata.type !== "Item") continue;
      console.time(`${MODULE_ID} |   Pack "${pack.collection}"`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const index = await pack.getIndex({ fields: ["type"] } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasSkills = index.some((entry: any) => entry.type === "skills");
      console.timeEnd(`${MODULE_ID} |   Pack "${pack.collection}"`);
      if (hasSkills) {
        const label = pack.folder?.name ?? pack.metadata.label;
        console.log(`${MODULE_ID} |   ✓ "${pack.collection}" → "${label}"`);
        skillPacks.push({ collection: pack.collection, label });
      }
    }
  }

  console.timeEnd(`${MODULE_ID} | Compendium choices`);
  console.log(`${MODULE_ID} | Found ${skillPacks.length} skill pack(s)`);

  skillPacks.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const choices: Record<string, string> = { "": "— None —" };
  for (const { collection, label } of skillPacks) {
    choices[collection] = label;
  }

  const setting = (game as Game).settings.settings.get(`${MODULE_ID}.compendiumSource`);
  if (setting) {
    (setting as { choices?: Record<string, string> }).choices = choices;
  }
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
