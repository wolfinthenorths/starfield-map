const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];

function toLL(point) {
  return [MAP_HEIGHT - point[1], point[0]];
}

function toLLs(points) {
  return points.map(toLL);
}

function chaikinClosed(points, iterations = 2) {
  // Safer smoothing than Catmull-Rom: it rounds corners without overshooting outside the original border.
  if (!points || points.length < 4) return points || [];

  let current = points.map(p => [p[0], p[1]]);

  for (let k = 0; k < iterations; k++) {
    const next = [];
    for (let i = 0; i < current.length; i++) {
      const p = current[i];
      const q = current[(i + 1) % current.length];

      next.push([
        0.75 * p[0] + 0.25 * q[0],
        0.75 * p[1] + 0.25 * q[1]
      ]);

      next.push([
        0.25 * p[0] + 0.75 * q[0],
        0.25 * p[1] + 0.75 * q[1]
      ]);
    }
    current = next;
  }

  return current;
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
const anomalyLayer = L.layerGroup().addTo(map);
const selectedCityLayer = L.layerGroup().addTo(map);
const districtLayer = L.layerGroup().addTo(map);
const labelLayer = L.layerGroup().addTo(map);

L.control.layers(null, {
  "Кликабельные города": hitCityLayer,
  "Кликабельные бункеры": hitVaultLayer,
  "Аномалии и опасные зоны": anomalyLayer,
  "Районы выбранного города": districtLayer
}, { collapsed: false }).addTo(map);

function makeList(items) {
  if (!items || !items.length) return "<p>Нет данных.</p>";
  return `<ul>${items.map(x => `<li>${x}</li>`).join("")}</ul>`;
}

function cardText(text) {
  return String(text || "").split(/\n+/).map(p => `<p>${p}</p>`).join("");
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
      <div class="card-section"><h3>Районы</h3><p>На карте показаны только районы этого города. Чтобы убрать их, нажмите «Скрыть районы».</p></div>
    `;
  }

  panel.classList.add("open");
}

function districtLabel(text) {
  return L.divIcon({
    html: `<div class="district-label">${text}</div>`,
    className: "",
    iconSize: [205, 48],
    iconAnchor: [102, 24]
  });
}

function clearDistricts() {
  selectedCityLayer.clearLayers();
  districtLayer.clearLayers();
  labelLayer.clearLayers();
}

function showCity(city) {
  clearDistricts();

  L.polygon(toLLs(chaikinClosed(city.hit, 1)), {
    className: "city-outline"
  }).addTo(selectedCityLayer);

  const cityDistricts = districts.filter(d => d.city === city.id);

  cityDistricts.forEach(d => {
    const poly = L.polygon(toLLs(chaikinClosed(d.pts, 2)), {
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
    maxZoom: 2
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

anomalies.forEach(anomaly => {
  const poly = L.polygon(toLLs(chaikinClosed(anomaly.pts, 2)), {
    className: "anomaly-shape",
    bubblingMouseEvents: false
  }).addTo(anomalyLayer);

  poly.on("click", (event) => {
    L.DomEvent.stopPropagation(event);
    clearDistricts();
    openPanel(anomaly, "anomaly");
  });
});
