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
const districtLayer = L.layerGroup().addTo(map);
const vaultLayer = L.layerGroup().addTo(map);

L.control.layers(null, {
  "Контуры городов": cityLayer,
  "Районы выбранного города": districtLayer,
  "Кликабельные бункеры": vaultLayer
}, { collapsed: false }).addTo(map);

let activeCityPolygon = null;

function makeList(items) {
  if (!items || !items.length) return "<p>Нет данных.</p>";
  return `<ul>${items.map(x => `<li>${x}</li>`).join("")}</ul>`;
}

function centroid(points) {
  let y = 0;
  let x = 0;
  points.forEach(p => {
    y += p[0];
    x += p[1];
  });
  return [y / points.length, x / points.length];
}

function labelIcon(text) {
  return L.divIcon({
    html: `<div class="district-label">${text}</div>`,
    className: "",
    iconSize: [170, 46],
    iconAnchor: [85, 23]
  });
}

function openPanel(item, kind) {
  const panel = document.getElementById("info-panel");
  const content = document.getElementById("panel-content");

  if (kind === "vault") {
    content.innerHTML = `
      <p class="card-kicker">Бункер / опасная точка</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle || ""}</p>

      <div class="card-section">
        <h3>Год прекращения функционирования</h3>
        <p>${item.status || "не указан"}</p>
      </div>

      <div class="card-section">
        <h3>Ресурсы</h3>
        ${makeList(item.resources)}
      </div>

      <div class="card-section">
        <h3>Warning</h3>
        <p>${item.warning || "Нет данных."}</p>
      </div>
    `;
  } else if (kind === "district") {
    content.innerHTML = `
      <p class="card-kicker">Район / внутренняя зона города</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.subtitle || ""}</p>

      <div class="card-section">
        <h3>Описание</h3>
        <p>${item.text || ""}</p>
      </div>
    `;
  } else {
    content.innerHTML = `
      <p class="card-kicker">Город / область</p>
      <h2 class="card-title">${item.name}</h2>
      <p class="card-subtitle">${item.region || ""} · ${item.subtitle || ""}</p>

      <div class="card-section">
        <h3>Районы</h3>
        ${makeList((item.districts || []).map(d => d.name))}
      </div>

      <div class="card-section">
        <h3>Подсказка</h3>
        <p>На карте сейчас раскрыты только районы этого города. Нажмите на любой район, чтобы открыть его карточку.</p>
      </div>
    `;
  }

  panel.classList.add("open");
}

function selectCity(city, polygon) {
  districtLayer.clearLayers();

  if (activeCityPolygon) {
    activeCityPolygon.getElement()?.classList.remove("active");
  }

  activeCityPolygon = polygon;
  setTimeout(() => {
    polygon.getElement()?.classList.add("active");
  }, 0);

  (city.districts || []).forEach(district => {
    const poly = L.polygon(district.shape, {
      className: `district-shape district-${district.type || "admin"}`
    });

    poly.on("click", () => openPanel(district, "district"));
    poly.addTo(districtLayer);

    const c = centroid(district.shape);
    L.marker(c, {
      icon: labelIcon(district.name),
      interactive: false
    }).addTo(districtLayer);
  });

  openPanel(city, "city");
  map.flyToBounds(L.polygon(city.shape).getBounds(), {
    padding: [90, 90],
    maxZoom: 1.15,
    duration: 0.45
  });
}

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("info-panel").classList.remove("open");
});

cityShapes.forEach(city => {
  const polygon = L.polygon(city.shape, {
    className: "city-zone"
  }).addTo(cityLayer);

  polygon.on("click", () => selectCity(city, polygon));
});

vaults.forEach(vault => {
  const hit = L.circle(vault.coords, {
    radius: 38,
    className: "vault-hit"
  }).addTo(vaultLayer);

  hit.on("click", () => openPanel(vault, "vault"));
});
