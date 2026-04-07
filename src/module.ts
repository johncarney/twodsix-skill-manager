const MODULE_ID = "skill-manager";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing module`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Module ready`);
});
