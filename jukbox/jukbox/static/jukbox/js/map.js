indexedDB.deleteDatabase("MapDatabase"); // Wipe database on refresh

console.log("map.js loaded");
let stationMarkers = [];




const fetchQuakes = async function () {
  console.log("fetchQuakes called");
  try{
  const userInput = {
  "latLng": window.circle.getLatLng(),
  "maxRad": document.getElementById('radiusSlider').value,
  "minMag": magSlider.value,
  "startDate":startDateInput.value,
  "endDate": endDateInput.value,
  "dataProvider": document.getElementById('clientSelect').value,
  "channelCode": document.getElementById('channelSelect').value,
  }
  console.log("userInput:", JSON.stringify(userInput, null, 2));
  let limit = 5;
  let events = await fetchEvents(userInput,limit);
  await saveDictToStoreIndexedDB("eventStore", events);
  getAllEvents().then(events => {
      console.log("Events from IndexedDB:", events);
      plotPoints(events);
  });
  let stations = await quakesToStations(events, userInput,5);
  await saveDictToStoreIndexedDB("stationStore", stations);
  } catch (error) {
          alert('An error occurred while searching!');
      }

      window.map.dragging.enable();
      window.map.doubleClickZoom.enable();
      window.map.scrollWheelZoom.enable();
      document.querySelector('.leaflet-container').style.cursor = 'grab';
  };




async function ballParts(quake) {
  let mechanism = quake.preferredFocalMechanism();

  // Fallback to first focal mechanism if preferred is not available
  if (!mechanism && quake.focalMechanisms.length > 0) {
    mechanism = quake.focalMechanisms[0];
  }

  if (!mechanism) {
    console.log("No focal mechanism found for quake:", quake);
    return null;
  }

  const tensor = mechanism?.momentTensor?.tensor;

  if (!tensor) {
    console.log("No moment tensor found for mechanism:", mechanism);
    return null;
  }

  const components = [
    tensor.mrr, tensor.mtt, tensor.mpp,
    tensor.mrt, tensor.mrp, tensor.mtp
  ];

  if (components.some(c => c === null || c === undefined)) {
    console.log("Incomplete moment tensor components for tensor:", tensor);
    return null;
  }

  return components;
}



async function fetchEvents(userInput, limit) {
  baseUrl = "https://service.iris.edu";
  console.log("fetchEvents called with userInput:")
  if (!window.sp) {
    console.error("seisplotjs (window.sp) is not loaded.");
    return {};
  }

  const DateTime = window.sp.luxon.DateTime;

    let quakeQuery = new window.sp.fdsnevent.EventQuery()
  .latitude(userInput.latLng.lat)
  .longitude(userInput.latLng.lng)
  .maxRadius(userInput.maxRad)
  .minMag(userInput.minMag)
  .startTime(window.sp.luxon.DateTime.fromISO(userInput.startDate))
  .endTime(window.sp.luxon.DateTime.fromISO(userInput.endDate))
  .limit(limit)
  .orderBy("magnitude");

  try {
    const quakesData = await quakeQuery.query();
    console.log(`Fetched ${quakesData.length} quake events.`);
    const results = {};

    for (const quake of quakesData) {
      let origin = quake.preferredOrigin();
      if (!origin && quake.origins.length > 0) {
        origin = quake.origins[0];
      }
      if (!origin) {
        console.log("No origin found for quake:", quake);
        continue;
      }

      const lat = origin.latitude;
      const lng = origin.longitude;
      const depth = (origin.depth || 0) / 1000.0; // Convert to km
      const mag = quake.preferredMagnitude()?.mag || null;

      const originTime = window.sp.util.isoToDateTime(origin.time);
      const originStartTime = originTime.minus({ minutes: 5 }).toISO();
      const originEndTime = originTime.plus({ minutes: 10 }).toISO();

      const eventId = crypto.randomUUID(); // Random key

      results[eventId] = {
        eventId,
        latLng: { lat, lng },
        depth,
        mag,
        startTime: originStartTime,
        endTime: originEndTime,
        icon: "/static/jukbox/img/center.png",
        tensorParts: await ballParts(quake)
      };
    }

    return results;
  } catch (err) {
    console.error("Error fetching quake events:", err);
    return {};
  }
}

async function quakesToStations(quakes, userInput, limit, baseUrl = "https://service.iris.edu") {
  const ret = {};
  for (let key in quakes){
    let quake = quakes[key];
   if (!quake || !quake.latLng.lat || !quake.latLng.lng || !quake.startTime || !quake.endTime) { 
    console.error("Invalid quake object:", quake); return []; } 
    ret[key] = await fetchClosestStations(quake, userInput);
  }
  return ret;
}



// retrns a list of five closest stations
async function fetchClosestStations(quake, userInput, limit = 100, baseUrl = "https://service.iris.edu") {
  if (!window.sp) {
    console.error("seisplotjs (window.sp) is not loaded.");
    return [];
  }

  const DateTime = window.sp.luxon.DateTime;
  const distaz = window.sp.distaz;

  // Query station metadata near quake location and time window
  const stationQuery = new window.sp.fdsnstation.FDSNStationQuery()
    .protocol("https")
    .host(baseUrl.replace(/^https?:\/\//, ''))
    .latitude(quake.latLng.lat)
    .longitude(quake.latLng.lng)
    .maxRadius(userInput.maxRad)
    .startTime(DateTime.fromISO(quake.startTime))
    .endTime(DateTime.fromISO(quake.endTime))
    .limit(limit)
    .includeResponse(false)
    .nodata(404);

  try {
    const stationXML = await stationQuery.query();
    const networks = window.sp.fdsnstationxml.parseStationXml(stationXML);

    const quakeStart = DateTime.fromISO(quake.startTime);
    const quakeEnd = DateTime.fromISO(quake.endTime);

    const stationsWithDist = [];

    for (const net of networks) {
      for (const sta of net.stations) {
        // Use the station's start/end dates if available, otherwise fallback to quake times
        const staStart = sta.startDate ? DateTime.fromISO(sta.startDate) : null;
        const staEnd = sta.endDate ? DateTime.fromISO(sta.endDate) : null;

        // Check if station operational during quake time window
        if (staStart && staStart > quakeEnd) continue;
        if (staEnd && staEnd < quakeStart) continue;

        // Location code: take first channel location or use '--' as fallback
        // Since we're not iterating channels, just grab locationCode from first channel that matches channelCode
        const matchingChannel = sta.channels.find(ch => ch.code === userInput.channelCode);
        const locCode = matchingChannel && matchingChannel.locationCode && matchingChannel.locationCode.trim() !== "" ? matchingChannel.locationCode : "--";

        // Build seedId with network.station.location.channel
        const seedId = `${net.code}.${sta.code}.${locCode}.${userInput.channelCode}`;

        // Calculate distance from quake to station
        const distanceData = distaz(quake.latLng.lat, quake.latLng.lng, sta.latitude, sta.longitude);
        const distanceKm = distanceData.distance;

        stationsWithDist.push({
          latLng: { lat: sta.latitude, lng: sta.longitude },
          network: net.code,
          station: sta.code,
          elevation: sta.elevation,
          siteName: sta.site?.name || "",
          startTime: sta.startDate,
          endTime: sta.endDate,
          distanceKm: distanceKm,
          icon: "/static/jukbox/img/station.png",
          seedId: seedId
        });
      }
    }

    // Sort by distance ascending and limit results
    stationsWithDist.sort((a, b) => a.distanceKm - b.distanceKm);
    return stationsWithDist.slice(0, 5);

  } catch (err) {
    if (err.status === 404) {
      console.log("No stations found in radius.");
      return [];
    } else {
      console.error("Error fetching station metadata:", err);
      return [];
    }
  }
}





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
  console.log("running getAllEvents");
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
    if (point.latLng && typeof point.latLng.lat === 'number' && typeof point.latLng.lng === 'number') {
      const customIcon = L.icon({
        iconUrl: point.icon,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });

      const marker = L.marker([point.latLng.lat, point.latLng.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`Lat: ${point.latLng.lat}<br>Lng: ${point.latLng.lng}<br>starttime: ${point.startTime || 'N/A'}<br>endtime: ${point.endTime || 'N/A'}`, { autoPan: false });

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
    const latlngs = points.map(p => [p.latLng.lat, p.latLng.lng]);
    // map.fitBounds(latlngs); // Uncomment if you want to zoom to bounds
  }
}







function plotStations(points) {
  stationMarkers.forEach(marker => map.removeLayer(marker));
  stationMarkers = [];

  const waveForms = fetchWaveformsBulk(points);

  points.forEach(point => {
    if (point.latLng && typeof point.latLng.lat === 'number' && typeof point.latLng.lng === 'number') {
      const customIcon = L.icon({
        iconUrl: point.icon,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });

      const marker = L.marker([point.latLng.lat, point.latLng.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`Lat: ${point.latLng.lat}<br>Lng: ${point.latLng.lng}<br>starttime: ${point.startTime || 'N/A'}<br>endtime: ${point.endTime || 'N/A'}`, { autoPan: false });

      marker.on('click', function () {
        document.body.style.cursor = 'default';
        map.dragging.enable();
      });

      stationMarkers.push(marker);
    }
  });

  if (points.length > 0) {
    const latlngs = points.map(p => [p.latLng.lat, p.latLng.lng]);
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

