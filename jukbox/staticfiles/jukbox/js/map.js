indexedDB.deleteDatabase("MapDatabase"); // Wipe database on refresh

console.log("map.js loaded");
let stationMarkers = [];

async function fetchWaveformsBulk(stations, baseUrl = "https://service.iris.edu") {
  if (!window.sp) {
    console.error("seisplotjs (window.sp) is not loaded.");
    return [];
  }

  const DateTime = window.sp.luxon.DateTime;
  const allSeismograms = [];

  for (const station of stations) {
    const [network, stationCode, location, channel] = station.seedId.split(".");
    if (!network || !stationCode || !channel) {
      console.warn(`Invalid seedId: ${station.seedId}`);
      continue;
    }
    const locCode = location === "" ? "--" : location;
    let timeWindow = sp.util.startDuration(station.starttime, 600);
    const query = new window.sp.fdsndataselect.DataSelectQuery();

    query.baseUrl = baseUrl + "/fdsnws/dataselect/1";

    query
      .networkCode(network)
      .stationCode(stationCode)
      .locationCode(locCode)
      .channelCode(channel)
      .timeRange(timeWindow);

    try {
      allSeismograms.push(query);
    } catch (err) {
      console.error(`Failed to fetch waveforms for ${station.seedId}:`, err);
    }
  }

  console.log("Fetched all waveforms:", allSeismograms);
  return allSeismograms;
}

async function openDatabaseWithStores(storeNames, dbName = "MapDatabase", version = 1) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      storeNames.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { autoIncrement: true });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDictToStoreIndexedDB(storeName, items) {
  console.log("Saving items to IndexedDB store:", storeName, items);
  const db = await openDatabaseWithStores(["eventStore", "stationStore", "waveStore"]);
  const tx = db.transaction([storeName], 'readwrite');
  const store = tx.objectStore(storeName);

  Object.entries(items).forEach(([key, value]) => {
    store.put(value, key);
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function saveArrayToStoreIndexedDB(storeName, items) {
  console.log("Saving items to IndexedDB store:", storeName, items);
  const db = await openDatabaseWithStores(["eventStore", "stationStore", "waveStore"]);
  const tx = db.transaction([storeName], 'readwrite');
  const store = tx.objectStore(storeName);

  items.forEach(item => {
    store.put(item);
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function clearMarkers(map) {
  if (map.markers) {
    map.markers.forEach(marker => marker.remove());
  }
  map.markers = [];
}

function getAllEvents() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MapDatabase", 1);
    request.onsuccess = function (event) {
      const db = event.target.result;
      const tx = db.transaction("eventStore", "readonly");
      const store = tx.objectStore("eventStore");
      const allEventsRequest = store.getAll();

      allEventsRequest.onsuccess = function () {
        resolve(allEventsRequest.result);
      };
      allEventsRequest.onerror = function () {
        reject(allEventsRequest.error);
      };
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

function plotPoints(points) {
  if (!window.map) {
    console.error("Global map instance not found.");
    return;
  }

  points.forEach(point => {
    if (typeof point.lat === 'number' && typeof point.lon === 'number') {
      const customIcon = L.icon({
        iconUrl: point.icon,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });

      const marker = L.marker([point.lat, point.lon], { icon: customIcon })
        .addTo(map)
        .bindPopup(`Lat: ${point.lat}<br>Lon: ${point.lon}<br>starttime: ${point.starttime || 'N/A'}<br>endtime: ${point.endtime || 'N/A'}`, { autoPan: false });

      marker.on('click', function () {
        document.body.style.cursor = 'default';
        map.dragging.enable();

        const id = point.eventId;
        const request = indexedDB.open('MapDatabase', 1);

        request.onsuccess = function (event) {
          const db = event.target.result;
          const transaction = db.transaction(['stationStore'], 'readonly');
          const store = transaction.objectStore('stationStore');
          const getRequest = store.get(String(id));

          getRequest.onsuccess = function () {
            if (getRequest.result) {
              plotStations(getRequest.result);
            } else {
              console.log('No data found for ID:', id);
            }
          };

          getRequest.onerror = function () {
            console.error('Error fetching data for ID:', id);
          };
        };

        request.onerror = function (event) {
          console.error('Error opening IndexedDB:', event.target.error);
        };
      });
    }
  });

  if (points.length > 0) {
    const latlngs = points.map(p => [p.lat, p.lon]);
    // map.fitBounds(latlngs); // Uncomment if you want to zoom to bounds
  }
}

function plotStations(points) {
  stationMarkers.forEach(marker => map.removeLayer(marker));
  stationMarkers = [];

  const waveForms = fetchWaveformsBulk(points);

  points.forEach(point => {
    if (typeof point.lat === 'number' && typeof point.lon === 'number') {
      const customIcon = L.icon({
        iconUrl: point.icon,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });

      const marker = L.marker([point.lat, point.lon], { icon: customIcon })
        .addTo(map)
        .bindPopup(`Lat: ${point.lat}<br>Lon: ${point.lon}<br>starttime: ${point.starttime || 'N/A'}<br>endtime: ${point.endtime || 'N/A'}`, { autoPan: false });

      marker.on('click', function () {
        document.body.style.cursor = 'default';
        map.dragging.enable();
      });

      stationMarkers.push(marker);
    }
  });

  if (points.length > 0) {
    const latlngs = points.map(p => [p.lat, p.lon]);
    // map.fitBounds(latlngs);
  }

  // Clear previous waveform displays
  document.querySelector("#myseismograph").innerHTML = "";

  waveForms.then(waveforms => {
    waveforms.forEach(waveform => {
      waveform.querySeismograms()
        .then((seisArray) => {
          const div = document.querySelector("div#myseismograph");
          let seisConfig = new sp.seismographconfig.SeismographConfig();
          let seisData = [];

          for (let s of seisArray) {
            seisData.push(sp.seismogram.SeismogramDisplayData.fromSeismogram(s));
          }

          let graph = new sp.seismograph.Seismograph(seisData, seisConfig);
          div.appendChild(graph);
        })
        .catch(function (error) {
          const div = document.querySelector("div#myseismograph");
          div.innerHTML = `<p>Error loading data. ${error}</p>`;
          console.assert(false, error);
        });
    });
  });
}
