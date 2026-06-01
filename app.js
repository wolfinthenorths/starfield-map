const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];

function toLL(point) {
  // point = [x, y] in normal image pixels, top-left origin.
  // Leaflet CRS.Simple uses y in the opposite direction for this bounds setup.
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

L.imageOverlay(MAP_IMAGE, bounds).addTo(map);
map.fitBounds(bounds);

const hitCityLayer = L.layerGroup().addTo(map);
const hitVaultLayer = L.layerGroup().addTo(map);
const selectedCityLayer = L.layerGroup().addTo(map);
const districtLayer = L.layerGroup().addTo(map);
const labelLayer = L.layerGroup().addTo(map);

L.control.layers(null, {
  "Кликабельные города": hitCityLayer,
  "Кликабельные бункеры": hitVaultLayer,
  "Районы выбранного города": districtLayer
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
      <div class="card-section"><h3>Описание</h3><p>${item.text}</p></div>
    `;
  } else {
    content.innerHTML = `
      <p class="card-kicker">Город / ${item.region}</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle}</p>
      <div class="card-section"><h3>Описание</h3><p>${item.text}</p></div>
      <div class="card-section"><h3>Районы</h3><p>На карте показаны только районы этого города. Чтобы убрать их, нажмите «Скрыть районы».</p></div>
    `;
  }

  panel.classList.add("open");
}

function districtLabel(text) {
  return L.divIcon({
    html: `<div class="district-label">${text}</div>`,
    className: "",
    iconSize: [190, 40],
    iconAnchor: [95, 20]
  });
}

function clearDistricts() {
  selectedCityLayer.clearLayers();
  districtLayer.clearLayers();
  labelLayer.clearLayers();
}

function showCity(city) {
  clearDistricts();

  const outline = L.polygon(toLLs(city.hit), {
    className: "city-outline"
  }).addTo(selectedCityLayer);

  const cityDistricts = districts.filter(d => d.city === city.id);

  cityDistricts.forEach(d => {
    const poly = L.polygon(toLLs(d.pts), {
      className: `district-shape ${d.kind || ""}`,
      bubblingMouseEvents: false
    }).addTo(districtLayer);

    poly.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      openPanel(d, "district");
    });

    L.marker(toLL(d.label), {
      icon: districtLabel(d.name),
      interactive: false
    }).addTo(labelLayer);
  });

  const viewBounds = L.latLngBounds([toLL(city.view[0]), toLL(city.view[1])]);
  map.fitBounds(viewBounds.pad(0.18), {
    animate: true,
    maxZoom: 1
  });

  openPanel(city, "city");
}

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("info-panel").classList.remove("open");
});

document.getElementById("clear-districts").addEventListener("click", () => {
  clearDistricts();
});

cities.forEach(city => {
  const zone = L.polygon(toLLs(city.hit), {
    className: "hit-zone",
    fill: true,
    color: "#5c2639",
    fillColor: "#5c2639",
    bubblingMouseEvents: false
  }).addTo(hitCityLayer);

  zone.on("click", (event) => {
    L.DomEvent.stopPropagation(event);
    showCity(city);
  });
});

vaults.forEach(vault => {
  const zone = L.circle(toLL(vault.center), {
    radius: vault.radius,
    className: "hit-zone",
    color: "#233b47",
    fillColor: "#233b47",
    fill: true,
    bubblingMouseEvents: false
  }).addTo(hitVaultLayer);

  zone.on("click", (event) => {
    L.DomEvent.stopPropagation(event);
    clearDistricts();
    openPanel(vault, "vault");
  });
});
