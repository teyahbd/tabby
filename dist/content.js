"use strict";
(() => {
  // src/render/layout.ts
  var PET_SIZE = 48;
  var BASE_MARGIN = 24;
  function basePosition(viewport, petSize = PET_SIZE) {
    return {
      x: Math.max(0, viewport.width - petSize - BASE_MARGIN),
      y: Math.max(0, viewport.height - petSize - BASE_MARGIN)
    };
  }

  // src/render/pet.ts
  var ROOT_ID = "tabby-root";
  function mountPet(doc = document) {
    if (doc.getElementById(ROOT_ID)) return () => {
    };
    const root = doc.createElement("div");
    root.id = ROOT_ID;
    const sprite = doc.createElement("div");
    sprite.id = "tabby-sprite";
    sprite.setAttribute("role", "img");
    sprite.setAttribute("aria-label", "Tabby");
    root.appendChild(sprite);
    const place = () => {
      const pos = basePosition({
        width: doc.documentElement.clientWidth,
        height: doc.documentElement.clientHeight
      });
      root.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    };
    doc.body.appendChild(root);
    place();
    const view = doc.defaultView;
    view?.addEventListener("resize", place);
    return () => {
      view?.removeEventListener("resize", place);
      root.remove();
    };
  }

  // src/content/index.ts
  mountPet();
})();
