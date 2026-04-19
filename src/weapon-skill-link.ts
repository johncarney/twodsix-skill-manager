import { getActorSkills, loadCompendiumSkills } from "./skill-search.ts";
import type { SkillSystem } from "./skill-search.ts";

interface WeaponSystem {
  skill?: string;
  associatedSkillName?: string;
}

export function registerWeaponSkillLink(): void {
  Hooks.on("createItem", (item: Item, _options: unknown, userId: string) => {
    if ((game as Game).user?.id !== userId) return;
    if (item.type !== "weapon") return;
    if (!item.parent || item.parent.documentName !== "Actor") return;
    void linkGroupSkill(item);
  });
}

async function linkGroupSkill(weapon: Item): Promise<void> {
  const actor = weapon.parent as Actor;
  const system = weapon.system as unknown as WeaponSystem;

  if (!system.skill || !system.associatedSkillName) return;

  // Only act when the weapon is linked to the Untrained skill
  const linkedSkill = actor.items.get(system.skill);
  if (!linkedSkill?.getFlag("twodsix", "untrainedSkill")) return;

  const associatedName = system.associatedSkillName;

  // Load from compendium to check for group membership
  const compendiumSkills = await loadCompendiumSkills();
  const source = compendiumSkills.find((s) => s.name === associatedName);
  if (!source) return;

  const sourceSystem = source.system as unknown as SkillSystem;
  if (!sourceSystem.groupLabel) return;

  // Only act if a sibling in the same group is trained.
  // An owned specialization at -3 does not qualify — leaving the weapon on
  // the generic Untrained skill preserves twodsix's intended roll (including
  // Jack-of-All-Trades, which does not apply to untrained group skills).
  const actorSkills = getActorSkills(actor);
  const hasTrainedSibling = actorSkills.some((s) => {
    const sys = s.system as unknown as SkillSystem;
    return sys.groupLabel === sourceSystem.groupLabel && sys.value >= 0;
  });
  if (!hasTrainedSibling) return;

  // Use existing specialization if present, otherwise create it at value 0
  let targetSkill = actorSkills.find((s) => s.name === associatedName);
  if (!targetSkill) {
    const itemData = source.toObject() as Record<string, unknown>;
    (itemData.system as unknown as SkillSystem).value = 0;
    [targetSkill] = (await actor.createEmbeddedDocuments("Item", [itemData])) as Item[];
  }

  await weapon.update({ "system.skill": targetSkill.id });
}
