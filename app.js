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

const layers = {
  "Города": L.layerGroup().addTo(map),
  "Бункеры": L.layerGroup().addTo(map),
  "Инфраструктура": L.layerGroup().addTo(map),
  "Маршруты": L.layerGroup().addTo(map)
};

L.control.layers(null, layers, { collapsed: false }).addTo(map);

function htmlIcon(label, className = "") {
  return L.divIcon({
    html: `<div class="map-icon ${className}"><span>${label}</span></div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function openPanel(item) {
  const panel = document.getElementById("info-panel");
  const content = document.getElementById("panel-content");

  let body = "";

  if (item.type === "vault") {
    body = `
      <p class="card-kicker">Бункер / опасная точка</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle || ""}</p>

      <div class="card-section">
        <h3>Статус</h3>
        <p>${item.status || "не уточнён"}</p>
      </div>

      <div class="card-section">
        <h3>Ресурсы</h3>
        <ul>${(item.resources || []).map(x => `<li>${x}</li>`).join("")}</ul>
      </div>

      <div class="card-section">
        <h3>Warning</h3>
        <p>${item.warning || "Нет данных."}</p>
      </div>
    `;
  } else if (item.type === "route") {
    body = `
      <p class="card-kicker">Маршрут</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle || ""}</p>
      <div class="card-section">
        <h3>Описание</h3>
        <p>${item.text || ""}</p>
      </div>
    `;
  } else {
    body = `
      <p class="card-kicker">${item.layer || "Точка карты"}</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle || ""}</p>
      <div class="card-section">
        <h3>Описание</h3>
        <p>${item.text || ""}</p>
      </div>
    `;
  }

  content.innerHTML = body;
  panel.classList.add("open");
}

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("info-panel").classList.remove("open");
});

cities.forEach(item => {
  L.marker(item.coords, { icon: htmlIcon("•", "small") })
    .addTo(layers["Города"])
    .on("click", () => openPanel(item));
});

vaults.forEach(item => {
  L.marker(item.coords, { icon: htmlIcon(item.number, "vault") })
    .addTo(layers["Бункеры"])
    .on("click", () => openPanel(item));
});

places.forEach(item => {
  L.marker(item.coords, { icon: htmlIcon("◆", "place") })
    .addTo(layers["Инфраструктура"])
    .on("click", () => openPanel(item));
});

routes.forEach(item => {
  const line = L.polyline(item.points, {
    color: item.color,
    weight: 3,
    opacity: 0.74,
    className: "route-line"
  }).addTo(layers["Маршруты"]);

  line.on("click", () => openPanel(item));
});
