
const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];

function toLL(point) {
  return [MAP_HEIGHT - point[1], point[0]];
}

function toLLs(points) {
  return points.map(toLL);
}

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 3,
  zoomControl: true,
  attributionControl: false
});

map.createPane("cityOutlinePane");
map.getPane("cityOutlinePane").style.zIndex = 250;

map.createPane("cityHitPane");
map.getPane("cityHitPane").style.zIndex = 260;

map.createPane("cityFillPane");
map.getPane("cityFillPane").style.zIndex = 310;

map.createPane("districtPane");
map.getPane("districtPane").style.zIndex = 340;

map.createPane("anomalyPane");
map.getPane("anomalyPane").style.zIndex = 360;

map.createPane("vaultPane");
map.getPane("vaultPane").style.zIndex = 500;

map.createPane("labelPane");
map.getPane("labelPane").style.zIndex = 650;

L.imageOverlay(MAP_IMAGE, bounds).addTo(map);
map.fitBounds(bounds);

const cityOutlineLayer = L.layerGroup();
const cityHitLayer = L.layerGroup().addTo(map);
const hitVaultLayer = L.layerGroup().addTo(map);
const anomalyLayer = L.layerGroup().addTo(map);
const selectedCityLayer = L.layerGroup().addTo(map);
const districtLayer = L.layerGroup().addTo(map);
const labelLayer = L.layerGroup().addTo(map);

L.control.layers(null, {
  "Контуры городов": cityOutlineLayer,
  "Бункеры": hitVaultLayer,
  "Аномалии": anomalyLayer,
  "Районы выбранного города": districtLayer
}, { collapsed: false }).addTo(map);

let currentCity = null;

function makeList(items) {
  if (!items || !items.length) return "<p>Нет данных.</p>";
  return `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
}

function cardText(text) {
  return String(text || "").split(/\n+/).filter(Boolean).map(paragraph => `<p>${paragraph}</p>`).join("");
}

function makeNotes(notes) {
  if (!notes || !notes.length) return "";
  return notes.map(note => `
    <div class="card-section">
      <h3>${note.title}</h3>
      ${cardText(note.text)}
    </div>
  `).join("");
}

function openPanel(item, kind) {
  const panel = document.getElementById("info-panel");
  const content = document.getElementById("panel-content");

  if (kind === "vault") {
    content.innerHTML = `
      <p class="card-kicker">Бункер / опасная точка</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle}</p>
      <div class="card-section"><h3>Год прекращения функционирования</h3><p>${item.status}</p></div>
      <div class="card-section"><h3>Ресурсы</h3>${makeList(item.resources)}</div>
      <div class="card-section"><h3>Warning</h3><p>${item.warning}</p></div>
    `;
  } else if (kind === "district") {
    content.innerHTML = `
      <p class="card-kicker">Район выбранного города</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle}</p>
      <div class="card-section"><h3>Описание</h3>${cardText(item.text)}</div>
    `;
  } else if (kind === "anomaly") {
    content.innerHTML = `
      <p class="card-kicker">Аномалия / опасная зона</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle}</p>
      <div class="card-section"><h3>Описание</h3>${cardText(item.text)}</div>
    `;
  } else {
    content.innerHTML = `
      <p class="card-kicker">Город / ${item.region}</p>
      <h2 class="card-title">${item.displayName || item.name}</h2>
      <p class="card-subtitle">${item.subtitle}</p>
      <div class="card-section"><h3>Описание</h3>${cardText(item.text)}</div>
      ${makeNotes(item.notes)}
      <div class="card-section"><h3>Режим просмотра</h3><p>После клика карта приближается к выбранному городу, а районы отображаются только в его пределах.</p></div>
    `;
  }

  panel.classList.add("open");
}

function districtLabel(text) {
  return L.divIcon({
    html: `<div class="district-label">${text}</div>`,
    className: "",
    iconSize: [210, 48],
    iconAnchor: [105, 24]
  });
}

function clearDistricts() {
  currentCity = null;
  selectedCityLayer.clearLayers();
  districtLayer.clearLayers();
  labelLayer.clearLayers();
}

function resetOverview(closePanel = false) {
  clearDistricts();
  map.fitBounds(bounds, { animate: true, maxZoom: 0 });
  document.getElementById("clear-districts").classList.remove("active");
  if (closePanel) {
    document.getElementById("info-panel").classList.remove("open");
  }
}

function addDistrictShape(district) {
  const parts = district.parts ? district.parts : [district.pts];
  const className = `district-shape ${district.kind || ""} ${district.special_class || ""}`.trim();

  parts.forEach(part => {
    const polygon = L.polygon(toLLs(part), {
      pane: "districtPane",
      className,
      bubblingMouseEvents: false
    }).addTo(districtLayer);

    polygon.on("click", event => {
      L.DomEvent.stopPropagation(event);
      openPanel(district, "district");
    });
  });
}

function showCity(city) {
  clearDistricts();
  currentCity = city.id;

  L.polygon(toLLs(city.hit), {
    pane: "cityFillPane",
    className: "city-area selected-city-area",
    interactive: false
  }).addTo(selectedCityLayer);

  L.polygon(toLLs(city.hit), {
    pane: "cityOutlinePane",
    className: "city-outline selected-city-outline",
    interactive: false
  }).addTo(selectedCityLayer);

  districts
    .filter(district => district.city === city.id)
    .forEach(district => {
      addDistrictShape(district);
      L.marker(toLL(district.label), {
        pane: "labelPane",
        icon: districtLabel(district.name),
        interactive: false
      }).addTo(labelLayer);
    });

  const viewBounds = L.latLngBounds([toLL(city.view[0]), toLL(city.view[1])]);
  map.fitBounds(viewBounds.pad(0.06), { animate: true, maxZoom: 2.2 });
  document.getElementById("clear-districts").classList.add("active");
  openPanel(city, "city");
}

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("info-panel").classList.remove("open");
});

document.getElementById("clear-districts").addEventListener("click", () => {
  resetOverview(false);
});

cities.forEach(city => {
  L.polygon(toLLs(city.hit), {
    pane: "cityOutlinePane",
    className: "city-outline city-outline-passive",
    interactive: false
  }).addTo(cityOutlineLayer);

  const clickZone = L.circle(toLL(city.clickCenter), {
    pane: "cityHitPane",
    radius: city.clickRadius || 55,
    className: "hit-zone city-click-zone",
    stroke: false,
    fill: true,
    fillOpacity: 0.03
  }).addTo(cityHitLayer);

  clickZone.on("click", event => {
    L.DomEvent.stopPropagation(event);
    showCity(city);
  });
});

anomalies.forEach(anomaly => {
  const polygon = L.polygon(toLLs(anomaly.pts), {
    pane: "anomalyPane",
    className: "anomaly-shape",
    bubblingMouseEvents: false
  }).addTo(anomalyLayer);

  polygon.on("click", event => {
    L.DomEvent.stopPropagation(event);
    clearDistricts();
    openPanel(anomaly, "anomaly");
  });
});

vaults.forEach(vault => {
  const zone = L.circle(toLL(vault.center), {
    pane: "vaultPane",
    radius: vault.radius,
    className: "hit-zone",
    color: "#233b47",
    fillColor: "#233b47",
    fill: true,
    bubblingMouseEvents: false
  }).addTo(hitVaultLayer);

  zone.on("click", event => {
    L.DomEvent.stopPropagation(event);
    clearDistricts();
    openPanel(vault, "vault");
  });
});
