export const MODULE_ID = "twodsix-skill-manager";

interface SkillSystem {
  value: number;
  groupLabel: string;
}

interface SkillResult {
  name: string;
  compendiumId: string;
  groupLabel: string;
  bonus: number;
  alreadyOwned: boolean;
}

let compendiumSkillsCache: Item[] | null = null;
let cachedPackId: string | null = null;

export function clearCompendiumCache(): void {
  compendiumSkillsCache = null;
  cachedPackId = null;
}

export function injectSkillSearch(actor: Actor, html: HTMLElement): void {
  const skillsTab = html.querySelector<HTMLElement>("div[data-tab='skills']");
  if (!skillsTab) return;
  if (skillsTab.querySelector(".skill-search")) return;

  const container = document.createElement("div");
  container.className = "skill-search";
  container.innerHTML = `
    <div class="skill-search-bar">
      <i class="fas fa-search skill-search-icon"></i>
      <input type="text" class="skill-search-input" placeholder="Search skills…" autocomplete="off" />
    </div>
    <ul class="skill-search-results"></ul>
  `;

  skillsTab.appendChild(container);

  const input = container.querySelector<HTMLInputElement>(".skill-search-input")!;
  const resultsList = container.querySelector<HTMLUListElement>(".skill-search-results")!;
  resultsList.style.display = "none";

  let debounceTimer: ReturnType<typeof setTimeout>;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void onSearchInput(actor, input.value.trim(), resultsList);
    }, 200);
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target as Node)) {
      resultsList.style.display = "none";
    }
  });
}

async function onSearchInput(
  actor: Actor,
  query: string,
  listEl: HTMLUListElement,
): Promise<void> {
  if (!query) {
    listEl.style.display = "none";
    return;
  }
  const results = await searchSkills(actor, query);
  renderResults(actor, results, listEl);
}

async function searchSkills(actor: Actor, query: string): Promise<SkillResult[]> {
  const actorSkills = actor.items.filter(
    (i) => i.type === "skills" && !i.getFlag("twodsix", "untrainedSkill"),
  ) as unknown as Item[];

  const compendiumSkills = await loadCompendiumSkills();
  const joatLevel = getJoatLevel(actor);

  // Build name → {item, fromActor} map; actor's version takes precedence
  const skillMap = new Map<string, { item: Item; fromActor: boolean }>();
  for (const skill of compendiumSkills) {
    skillMap.set(skill.name.toLowerCase(), { item: skill, fromActor: false });
  }
  for (const skill of actorSkills) {
    skillMap.set(skill.name.toLowerCase(), { item: skill, fromActor: true });
  }

  const lowerQuery = query.toLowerCase();
  const results: SkillResult[] = [];

  for (const [, { item, fromActor }] of skillMap) {
    if (!item.name?.toLowerCase().includes(lowerQuery)) continue;

    const system = item.system as unknown as SkillSystem;
    const bonus = calculateBonus(system, item.name ?? "", actorSkills, joatLevel);
    const alreadyOwned = fromActor && system.value >= 0;

    results.push({
      name: item.name ?? "",
      compendiumId: item.id ?? "",
      groupLabel: system.groupLabel ?? "",
      bonus,
      alreadyOwned,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function calculateBonus(
  system: SkillSystem,
  skillName: string,
  actorSkills: Item[],
  joatLevel: number,
): number {
  // If actor already has this skill trained, show their level
  const actorSkill = actorSkills.find((s) => s.name === skillName);
  if (actorSkill) {
    const actorSystem = actorSkill.system as unknown as SkillSystem;
    if (actorSystem.value >= 0) return actorSystem.value;
  }

  // If another skill in the same group is trained, effective level is 0
  const groupLabel = system.groupLabel;
  if (groupLabel) {
    const hasTrainedGroupSkill = actorSkills.some((s) => {
      const sys = s.system as unknown as SkillSystem;
      return sys.groupLabel === groupLabel && sys.value >= 0;
    });
    if (hasTrainedGroupSkill) return 0;
  }

  // Untrained: -3 offset by JOAT level
  return -3 + joatLevel;
}

function getJoatLevel(actor: Actor): number {
  const untrainedItem = actor.items.find((i) =>
    i.getFlag("twodsix", "untrainedSkill"),
  );
  if (!untrainedItem) return 0;
  const system = untrainedItem.system as unknown as SkillSystem;
  const ruleset = (game as Game).settings.get("twodsix", "ruleset") as string;
  if (ruleset === "CT") return system.value >= 0 ? 1 : 0;
  // Cepheus: untrained default is -3; each JOAT level raises it by 1
  return system.value - -3;
}

function renderResults(
  actor: Actor,
  results: SkillResult[],
  listEl: HTMLUListElement,
): void {
  listEl.innerHTML = "";

  if (results.length === 0) {
    listEl.style.display = "none";
    return;
  }

  for (const result of results) {
    const li = document.createElement("li");
    li.className = "skill-search-result";
    li.dataset.skillName = result.name;
    li.dataset.compendiumId = result.compendiumId;
    li.dataset.groupLabel = result.groupLabel;

    const bonusStr = result.bonus >= 0 ? `+${result.bonus}` : `${result.bonus}`;
    const addOrCheck = result.alreadyOwned
      ? `<span class="skill-owned-indicator" title="Already trained"><i class="fas fa-check"></i></span>`
      : `<a class="skill-add-btn" title="Add skill"><i class="fas fa-plus"></i></a>`;

    li.innerHTML = `
      <span class="skill-name${result.alreadyOwned ? " owned" : ""}">${result.name}</span>
      <span class="skill-bonus">${bonusStr}</span>
      ${addOrCheck}
    `;

    if (!result.alreadyOwned) {
      li.querySelector(".skill-add-btn")!.addEventListener("click", (e) => {
        e.preventDefault();
        void addSkillToActor(actor, result);
      });
    }

    listEl.appendChild(li);
  }

  listEl.style.display = "block";
}

async function addSkillToActor(
  actor: Actor,
  result: SkillResult,
): Promise<void> {
  const compendiumSkills = await loadCompendiumSkills();
  const source =
    compendiumSkills.find((s) => s.id === result.compendiumId) ??
    compendiumSkills.find((s) => s.name === result.name);

  if (!source) {
    ui.notifications?.warn(`Could not find skill "${result.name}" in compendium.`);
    return;
  }

  const actorSkills = actor.items.filter(
    (i) => i.type === "skills" && !i.getFlag("twodsix", "untrainedSkill"),
  ) as unknown as Item[];

  const system = source.system as unknown as SkillSystem;
  let value = -3;

  if (system.groupLabel) {
    const hasTrainedGroupSkill = actorSkills.some((s) => {
      const sys = s.system as unknown as SkillSystem;
      return sys.groupLabel === system.groupLabel && sys.value >= 0;
    });
    if (hasTrainedGroupSkill) value = 0;
  }

  const itemData = source.toObject() as Record<string, unknown>;
  (itemData.system as unknown as SkillSystem).value = value;

  await actor.createEmbeddedDocuments("Item", [itemData]);
}

// Maps twodsix ruleset keys to the compendium pack that best matches them.
// Rulesets with no obvious skill pack (Barbaric!, Other, Rider, Sword of Cepheus)
// are omitted so they fall back to no default.
const RULESET_PACK_MAP: Record<string, string> = {
  CT: "twodsix.ct-items",
  CE: "twodsix.ce-srd-items",
  CEL: "twodsix.cepheus-light-items",
  CLU: "twodsix.cepheus-light-items",
  CEFTL: "twodsix.cepheus-faster-than-light-items",
  CEATOM: "twodsix.cepheus-atom-items",
  CEQ: "twodsix.cepheus-quantum-items",
  CD: "twodsix.cepheus-deluxe-items",
  CDEE: "twodsix.cepheus-deluxe-items",
  AC: "twodsix.alpha-cephei-items",
  CU: "twodsix.cepheus-universal-items",
  MGT2E: "twodsix.twoe-skills",
};

function getDefaultPackId(): string {
  const ruleset = (game as Game).settings.get("twodsix", "ruleset") as string;
  console.log(`Detected ruleset "${ruleset}", defaulting to pack "${RULESET_PACK_MAP[ruleset]}"`);
  return RULESET_PACK_MAP[ruleset] ?? "";
}

async function loadCompendiumSkills(): Promise<Item[]> {
  const configured = (game as Game).settings.get(MODULE_ID, "compendiumSource") as string;
  const packId = configured || getDefaultPackId();

  if (compendiumSkillsCache !== null && cachedPackId === packId) return compendiumSkillsCache;

  cachedPackId = packId;

  if (!packId) {
    compendiumSkillsCache = [];
    return compendiumSkillsCache;
  }

  const pack = (game as Game).packs?.get(packId);
  if (!pack) {
    compendiumSkillsCache = [];
    return compendiumSkillsCache;
  }

  const docs = (await pack.getDocuments()) as Item[];
  compendiumSkillsCache = docs.filter((d) => d.type === "skills");
  return compendiumSkillsCache;
}
