import { MODULE_ID, getActorSkills, getGroupValue, loadCompendiumSkills } from "./skill-search.ts";
import type { SkillSystem } from "./skill-search.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TwodsixRollSettings = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TwodsixGame = { twodsix?: { TwodsixRollSettings: { create: (...args: any[]) => Promise<TwodsixRollSettings> } } };

interface ParsedFormula {
  skill: Item | null;
  skillName: string;
  skillRoll: boolean;
  displayLabel: string;
  difficulty?: { mod: number; target: number };
  rollModifiers: {
    characteristic: string;
    other: number;
  };
}

export function registerSkillRollEnricher(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (CONFIG.TextEditor.enrichers as any[]).push({
    id: "skillRollPlus",
    pattern: /@SkillRollPlus(?:\[(.*?)\])?(?:{(.*?)})?/gm,
    enricher: enrichSkillRollPlus,
    onRender: addSkillRollPlusListener,
  });
}

async function enrichSkillRollPlus(
  match: RegExpMatchArray,
  options?: { relativeTo?: { getFlag?: (scope: string, key: string) => unknown } },
): Promise<HTMLElement | null> {
  if (options?.relativeTo?.getFlag?.("twodsix", "disableEnrichment")) {
    return null;
  }
  const parseString = match[1] || "";
  const label = match[2] || match[1];
  const a = document.createElement("a");
  a.classList.add("inline-roll", "skill-roll-plus");
  a.dataset.parseString = parseString;
  a.innerHTML = `<i class="fa-solid fa-dice"></i> ${label}`;
  return a;
}

function addSkillRollPlusListener(enrichedContent: HTMLElement): void {
  enrichedContent.querySelector(".skill-roll-plus")?.addEventListener("click", handleSkillRollPlus);
}

async function handleSkillRollPlus(event: Event): Promise<void> {
  event.preventDefault();
  event.stopPropagation();

  const parseString = (event.currentTarget as HTMLElement).dataset.parseString ?? "";
  const actor = getControlledTraveller();
  if (!actor) {
    ui.notifications?.warn("TWODSIX.Warnings.NoActorSelected", { localize: true });
    return;
  }

  const parsed = await parseSkillFormula(parseString, actor);
  if (!parsed) return;

  if (!parsed.skillRoll) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (actor as any).characteristicRoll(
      { rollModifiers: parsed.rollModifiers, difficulty: parsed.difficulty },
      true,
    );
    return;
  }

  await rollParsedSkill(actor, parsed);
}

async function rollParsedSkill(actor: Actor, parsed: ParsedFormula): Promise<void> {
  if (!parsed.skill) return;

  // If the resolved skill is already embedded on the actor, roll it directly
  if (parsed.skill.parent === actor) {
    await rollSkillItem(parsed.skill, actor, parsed);
    return;
  }

  // Skill came from the compendium — temp-add with group-aware value, roll, remove
  const actorSkills = getActorSkills(actor);
  const system = parsed.skill.system as unknown as SkillSystem;
  const value = getGroupValue(system.groupLabel, actorSkills);

  const itemData = parsed.skill.toObject() as Record<string, unknown>;
  (itemData.system as unknown as SkillSystem).value = value;

  const created = (await actor.createEmbeddedDocuments("Item", [itemData])) as Item[];
  const tempItem = created[0];

  try {
    await rollSkillItem(tempItem, actor, parsed);
  } finally {
    await actor.deleteEmbeddedDocuments("Item", [tempItem.id!]);
  }
}

async function rollSkillItem(skill: Item, actor: Actor, parsed: ParsedFormula): Promise<void> {
  const RollSettings = (game as unknown as TwodsixGame).twodsix?.TwodsixRollSettings;
  if (!RollSettings) {
    console.error(`${MODULE_ID} | TwodsixRollSettings not available`);
    return;
  }

  const settingsInput: Record<string, unknown> = {
    skillRoll: true,
    displayLabel: parsed.displayLabel,
    rollModifiers: parsed.rollModifiers,
  };
  if (parsed.difficulty) {
    settingsInput.difficulty = parsed.difficulty;
  }

  const settings = await RollSettings.create(true, settingsInput, skill, undefined, actor);
  if (!settings.shouldRoll) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (skill as any).skillRoll(false, settings);
}

// --- Formula parsing (mirrors twodsix getInitialSettingsFromFormula) ---

async function parseSkillFormula(parseString: string, actor: Actor): Promise<ParsedFormula | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TWODSIX = (CONFIG as any).TWODSIX;
  const difficulties = TWODSIX.DIFFICULTIES[(game as Game).settings.get("twodsix", "difficultyListUsed") as string];

  const re = /^(.[^/+=]*?) ?(?:\/([\S]+))? ?(?:(\d{0,2})\+)? ?(?:=(\w*))? ?$/;
  const result = re.exec(parseString);
  if (!result) {
    ui.notifications?.error("TWODSIX.Ship.CannotParseArgument", { localize: true });
    return null;
  }

  const [, parsedSkills, char, diff] = result;

  // Difficulty
  let difficulty: { mod: number; target: number } | undefined;
  let otherMod = 0;
  if (diff) {
    let diffSelected = parseInt(diff, 10);
    otherMod = diffSelected % 2 ? 1 : 0;
    diffSelected += diffSelected % 2;
    difficulty = (Object.values(difficulties) as { mod: number; target: number }[]).find(
      (d) => d.target === diffSelected,
    );
  }

  // Skill resolution
  let skill: Item | null = null;
  let skillName = "";
  const isSkillRoll = parsedSkills !== "" && parsedSkills !== "None";
  if (isSkillRoll) {
    skill = await resolveBestSkill(parsedSkills, actor);
    if (!skill) {
      const actorName = actor.name ?? "";
      const msg = (game as Game)
        .i18n!.localize("TWODSIX.Ship.ActorLacksSkill")
        .replace("_ACTOR_NAME_", actorName)
        .replace("_SKILL_", parsedSkills);
      ui.notifications?.error(msg);
      return null;
    }
    skillName = skill.name ?? "";
  }

  // Characteristic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const charObject = (actor.system as any).characteristics ?? {};
  const charObjectArray = Object.values(charObject) as {
    key: string;
    shortLabel: string;
    displayShortLabel: string;
    mod: number;
  }[];

  let characteristicKey = "";
  if (!char && skill) {
    const skillChar = (skill.system as unknown as { characteristic: string }).characteristic;
    if (skillChar) {
      characteristicKey = getKeyByValue(TWODSIX.CHARACTERISTICS, skillChar);
    }
  } else if (char && char !== "NONE") {
    const charOptions = char.split("|").map((s: string) => s.trim());
    const candidates = charObjectArray.filter(
      (ch) => charOptions.includes(ch.displayShortLabel) || charOptions.includes(ch.shortLabel),
    );
    if (candidates.length > 0) {
      const best = candidates.reduce((prev, cur) => (prev.mod > cur.mod ? prev : cur));
      characteristicKey = best.key;
    }
    if (!characteristicKey) {
      characteristicKey = getCharacteristicFromDisplayLabel(char, actor, TWODSIX);
    }
  }

  let shortLabel = "NONE";
  let displayLabel = "NONE";
  if (charObject && characteristicKey) {
    shortLabel = charObject[characteristicKey]?.shortLabel ?? "NONE";
    displayLabel = charObject[characteristicKey]?.displayShortLabel ?? "NONE";
  }

  const parsed: ParsedFormula = {
    skill,
    skillName,
    skillRoll: isSkillRoll,
    displayLabel,
    rollModifiers: { characteristic: shortLabel, other: otherMod },
  };
  if (difficulty) {
    parsed.difficulty = difficulty;
  }
  return parsed;
}

/**
 * Find the best skill matching the formula's skill list (pipe-separated).
 * Matches by full name OR simplified name (non-word characters stripped).
 * Prefers the actor's owned skills; falls back to the compendium.
 */
async function resolveBestSkill(skillList: string, actor: Actor): Promise<Item | null> {
  const options = skillList.split("|").map((s) => s.trim());
  const simplifiedOptions = options.map(simplifyName);

  const nameMatches = (name: string | null | undefined): boolean => {
    if (!name) return false;
    return options.includes(name) || simplifiedOptions.includes(simplifyName(name));
  };

  // Prefer actor's owned skills — pick highest value if multiple match
  const actorSkills = getActorSkills(actor);
  const ownedMatches = actorSkills.filter((s) => nameMatches(s.name));
  if (ownedMatches.length > 0) {
    return ownedMatches.reduce((prev, cur) => {
      const prevVal = (prev.system as unknown as SkillSystem).value;
      const curVal = (cur.system as unknown as SkillSystem).value;
      return curVal > prevVal ? cur : prev;
    });
  }

  // Fall back to compendium
  const compendiumSkills = await loadCompendiumSkills();
  return compendiumSkills.find((s) => nameMatches(s.name)) ?? null;
}

function simplifyName(name: string): string {
  return name.replace(/\W/g, "");
}

// --- Utility functions (mirrors twodsix utils) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getKeyByValue(object: Record<string, any>, value: unknown): string {
  if (!value || value === "NONE") return "";
  const compareValue = JSON.stringify(value);
  return Object.keys(object).find((key) => JSON.stringify(object[key]) === compareValue) ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCharacteristicFromDisplayLabel(char: string, actor: Actor, TWODSIX: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const charObject = (actor.system as any).characteristics;
  if (charObject) {
    const displayMap: Record<string, string> = {};
    for (const key in charObject) {
      displayMap[key] = charObject[key].displayShortLabel;
    }
    return getKeyByValue(displayMap, char);
  }
  return getKeyByValue(TWODSIX.CHARACTERISTICS, char);
}

// --- Actor resolution (mirrors twodsix getControlledTraveller) ---

function getControlledTraveller(): Actor | undefined {
  const g = game as Game;
  if (!g.user?.isGM) {
    if (g.user?.character) return g.user.character;
    const character = g.actors?.find(
      (a: Actor) =>
        a.permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && a.type === "traveller" && !!a.getActiveTokens()[0],
    );
    return character ?? undefined;
  }

  // GM: use selected traveller token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (canvas as any).tokens?.controlled as { actor: Actor | null }[] | undefined;
  if (tokens) {
    const selected = tokens.find((t) => t.actor?.type === "traveller");
    return selected?.actor ?? undefined;
  }
  return undefined;
}
