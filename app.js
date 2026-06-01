const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 3,
  zoomControl: true,
  attributionControl: false
});

L.imageOverlay(MAP_IMAGE, bounds).addTo(map);
map.fitBounds(bounds);

const cityLayer = L.layerGroup().addTo(map);
const vaultLayer = L.layerGroup().addTo(map);
L.control.layers(null, {
  "Проверка городов": cityLayer,
  "Проверка бункеров": vaultLayer
}, { collapsed: false }).addTo(map);

function makeList(items) {
  if (!items || !items.length) return "<p>Нет данных.</p>";
  return `<ul>${items.map(x => `<li>${x}</li>`).join("")}</ul>`;
}

function openPanel(item, kind) {
  const panel = document.getElementById("info-panel");
  const content = document.getElementById("panel-content");

  if (kind === "vault") {
    content.innerHTML = `
      <p class="card-kicker">Бункер / проверка зоны</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle}</p>
      <div class="card-section"><h3>Год прекращения функционирования</h3><p>${item.status}</p></div>
      <div class="card-section"><h3>Ресурсы</h3>${makeList(item.resources)}</div>
      <div class="card-section"><h3>Warning</h3><p>${item.warning}</p></div>
    `;
  } else {
    content.innerHTML = `
      <p class="card-kicker">Город / проверка зоны</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.region} · ${item.subtitle}</p>
      <div class="card-section"><h3>Проверка</h3><p>${item.text}</p></div>
      <div class="card-section"><h3>Что проверить глазами</h3><p>Светлый круг должен закрывать городскую подпись и точку города, но не должен слишком сильно залезать на соседний город или бункер.</p></div>
    `;
  }

  panel.classList.add("open");
}

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("info-panel").classList.remove("open");
});

function makeTextLabel(text, className, size = [160, 24]) {
  return L.divIcon({
    html: `<div class="${className}">${text}</div>`,
    className: "",
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2]
  });
}

cities.forEach(city => {
  const circle = L.circle(city.coords, {
    radius: city.radius,
    className: "city-zone"
  }).addTo(cityLayer);
  circle.on("click", () => openPanel(city, "city"));

  L.marker([city.coords[0] - city.radius - 18, city.coords[1]], {
    icon: makeTextLabel(city.name, "city-label", [210, 24]),
    interactive: false
  }).addTo(cityLayer);
});

vaults.forEach(vault => {
  const circle = L.circle(vault.coords, {
    radius: vault.radius,
    className: "vault-zone"
  }).addTo(vaultLayer);
  circle.on("click", () => openPanel(vault, "vault"));

  L.marker([vault.coords[0] - vault.radius - 10, vault.coords[1]], {
    icon: makeTextLabel(vault.number, "vault-label", [60, 20]),
    interactive: false
  }).addTo(vaultLayer);
});
