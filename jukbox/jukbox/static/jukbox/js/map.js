
indexedDB.deleteDatabase("MapDatabase");

console.log("map.js loaded");
let stationMarkers = [];



const normalizeLatLng = async function (latLng) {
  latLng.lng = ((latLng.lng + 180) % 360 + 360) % 360 - 180;
  return latLng
}






const quakeToImage = async function (quake) {
  let mag = quake.mag;
  if (mag <= 1.0) quake.icon = "/static/jukbox/img/w.png";
  else if (mag <= 2.0) quake.icon = "/static/jukbox/img/a.png";
  else if (mag <= 3.0 ) quake.icon = "/static/jukbox/img/t.png";
  else if (mag <= 4.0 ) quake.icon = "/static/jukbox/img/l.png";
  else if (mag <= 5.0 ) quake.icon = "/static/jukbox/img/y.png";
  else if (mag <= 6.0 ) quake.icon = "/static/jukbox/img/o.png";
  else if (mag <= 7.0 ) quake.icon = "/static/jukbox/img/r.png";
  else if (mag <= 8.0 ) quake.icon = "/static/jukbox/img/m.png";
  else quake.icon = '/static/jukbox/img/b.png';
  return quake
};

const beachball = async function (userInput) {
      console.log("searchgQuakes called");

      var searchData = {
          latLng: userInput.latLng,
          maxRad: userInput.maxRad,
          startDate: userInput.startDate,
          endDate: userInput.endDate,
          minMag: userInput.minMag,
          dataProvider: userInput.dataProvider
      };


      try {
          const response = await fetch('/search_quakes/', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'X-CSRFToken': getCookie('csrftoken')
              },
              body: JSON.stringify(searchData)
          });

          const result = await response.json();
          return result.events;
      } catch (error) {
          alert('map.html An error occurred while searching!');
      }

  }


const fetchQuakes = async function () {
  try{
  const userInput = {
  "latLng": await normalizeLatLng(window.circle.getLatLng()),
  "maxRad": document.getElementById('radiusSlider').value / 111.32,
  "minMag": magSlider.value,
  "startDate":startDateInput.value,
  "endDate": endDateInput.value,
  "dataProvider": document.getElementById('clientSelect').value,
  "channelCode": document.getElementById('channelSelect').value,
  }
  console.log("userInput:", JSON.stringify(userInput, null, 2));
  let limit = 5;
  let events = [];
  console.log("provider:", userInput.dataProvider)
  if (userInput.dataProvider == 'earthquake.usgs.gov'){
    events = await beachball(userInput);
  } else {
    events = await fetchEvents(userInput,limit);
  }
  await saveDictToStoreIndexedDB("eventStore", events);
  getAllEvents().then(events => {
      console.log("Events from IndexedDB:", events);
      plotPoints(events);
  });
  let stations = await quakesToStations(events, userInput,5);
  await saveDictToStoreIndexedDB("stationStore", stations);
  } catch (error) {
          console.log(error)
      }

      window.map.dragging.enable();
      window.map.doubleClickZoom.enable();
      window.map.scrollWheelZoom.enable();
      document.querySelector('.leaflet-container').style.cursor = 'grab';
  };






async function fetchEvents(userInput, limit) {
  //baseUrl = "https://service.iris.edu";
  //console.log("fetchEvents called with userInput:")
  if (!window.sp) {
    console.error("seisplotjs (window.sp) is not loaded.");
    return {};
  }

  const DateTime = window.sp.luxon.DateTime;


    let quakeQuery = new window.sp.fdsnevent.EventQuery()
  .protocol('https')
  .host(userInput.dataProvider)
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
      origin = quake.origin;
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
      //const mag = quake.preferredMagnitude?.mag || null;
      const mag = quake.magnitude.mag || null;
 
    const originTime = quake.time;


      const originStartTime = originTime.minus({ minutes: 5 }).toISO();
      const originEndTime = originTime.plus({ minutes: 10 }).toISO();

      const eventId = crypto.randomUUID(); // Random key

      results[eventId] = await quakeToImage({
        eventId,
        latLng: { lat, lng },
        depth,
        mag,
        startTime: originStartTime,
        endTime: originEndTime,
        icon: "/static/jukbox/img/center.png"
      });
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
    console.error("Invalid quake object:", quake); continue; } 
    ret[key] = await fetchClosestStations(quake, userInput);
  }
  console.log("quakesToStations result:", ret);
  return ret;
}



// retrns a list of five closest stations
async function fetchClosestStations(quake, userInput, limit = 10000, baseUrl = "https://service.iris.edu") {
  if (!window.sp) {
    console.error("seisplotjs (window.sp) is not loaded.");
    return [];
  }

  const DateTime = window.sp.luxon.DateTime;
  const distaz = window.sp.distaz.distaz;

  // Query station metadata near quake location and time window
  try{

    quakeTime = DateTime.fromISO(quake.startTime);
    //const quakeStart = quakeTime.minus({ hours: 24 });
    //const quakeEnd =  quakeTime.plus({ hours: 24 });
    const quakeStart = quakeTime.minus({minutes:5})
    const quakeEnd = quakeTime.plus({minutes:5})

  const stationQuery = new window.sp.fdsnstation.StationQuery()
    .protocol("https")
    .host(baseUrl.replace(/^https?:\/\//, ''))
    .latitude(quake.latLng.lat)
    .longitude(quake.latLng.lng)
    .maxRadius(userInput.maxRad)
    .startTime(quakeStart)
    .endTime(quakeEnd)
    .channelCode(userInput.channelCode)
    //.limit(limit)

  let xmlText = await stationQuery.queryRawXmlText(window.sp.fdsnstation.LEVEL_CHANNEL);
  xmlText = xmlText.replace(/<InstrumentSensitivity>[\s\S]*?<\/InstrumentSensitivity>/g, '');

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

//patch
    window.sp.stationxml.Response.prototype.fromXml = function () {
  this.instrumentSensitivity = null;
  this.stageList = [];
  return this;
};


    let networks;
    try {
      networks = window.sp.stationxml.parseStationXml(xmlDoc);
    } catch (parseErr) {
      console.error("Error parsing StationXML:", parseErr.message || parseErr);
      return []; // Gracefully skip malformed station data
    }

    //console.log(xmlText);

    //console.log("Station keys:", Object.keys(networks[0].stations[0]));




    let stationsWithDist = [];
    for (const net of networks) {
      for (const sta of net.stations) {
        const staStart = sta.startDate ? DateTime.fromISO(sta.startDate) : null;
       //const staEnd = DateTime.fromISO(staStart.plus({ hours: 48 }))
       const staEnd = sta.endDate ? DateTime.fromISO(sta.endDate) : DateTime.now();

        if (staStart === null || staEnd === null) console.log('start',staStart,"end",staEnd)

        //console.log(`Channels for station ${sta.stationCode}:`, sta.channels);


        // Check if station operational during quake time window
        if (staStart && staStart > quakeEnd) continue;
        if (staEnd && staEnd < quakeStart) continue;
        //let channelCode = "BHZ";
        const matchingChannel = sta.channels.find(ch => {
          if (ch && ch.channelCode && ch.channelCode.toUpperCase().includes(userInput.channelCode.toUpperCase())){
            channelCode = ch.channelCode;
            return true
          } else {
            return false
          }
        }

        );


      if (!matchingChannel) {
        console.warn(`No valid channels found in station ${sta.stationCode}`);
        continue; // Skip this station if no valid channel is found
      }


      const locCode = matchingChannel.locationCode && matchingChannel.locationCode.trim() !== "" 
        ? matchingChannel.locationCode 
        : "*";




      const seedId = `${net.networkCode}.${sta.stationCode}.${matchingChannel.locationCode}.${matchingChannel.channelCode}`;

                // Calculate distance from quake to station
        const distanceData = distaz(quake.latLng.lat, quake.latLng.lng, sta.latitude, sta.longitude);
        const distanceKm = distanceData.distance;

        stationsWithDist.push({
          latLng: { lat: sta.latitude, lng: sta.longitude },
          network: net.networkCode,
          station: sta.stationCode,
          channel: matchingChannel.channelCode,
          elevation: sta.elevation,
          siteName: sta.site?.name || "",
          startTime: staStart,
          endTime: staEnd,
          distanceKm: distanceKm,
          icon: "/static/jukbox/img/station.jpg",
          seedId: seedId
        });
      }
    }

    console.log("stationsWithDist",stationsWithDist)
    return stationsWithDist.sort((a, b) => a.distanceKm - b.distanceKm);


  } catch (err) {
    if (err.status === 404) {
      console.log("No stations found in radius.");
      return [];
    } else {
      console.error("Error fetching station metadata:", err);
  return [];
  }
}}




async function fetchWaveformsBulk(stations, quake, baseUrl = "https://service.iris.edu") {
  if (!window.sp) {
    console.error("seisplotjs (window.sp) is not loaded.");
    return [];
  }

  const allSeismograms = [];

  for (const station of stations) {
    const [network, stationCode, location, channel] = station.seedId.split(".");
    if (!network || !stationCode || !channel) {
      console.warn(`Invalid seedId: ${station.seedId}`);
      continue;
    }
    const locCode = location === "" ? "--" : location;
    //let start = station.startTime
    //let timeWindow = sp.util.startDuration(start, 600);
    const query = new window.sp.fdsndataselect.DataSelectQuery();

    query.baseUrl = baseUrl + "/fdsnws/dataselect/1";

    const DateTime = window.sp.luxon.DateTime;

    let startTime = quake.startTime;
    if (typeof startTime === 'string') {
      startTime = DateTime.fromISO(startTime);
    }
    startTime = window.sp.luxon.DateTime.fromMillis(startTime.ts);
    let endTime = startTime.plus({ minutes: 20 });
      query
        //.networkCode(network)
        .networkCode(network ? network : "*")
        .stationCode(stationCode)
        //.timeRange(timeWindow)
        .startTime(startTime.toISO())
        .channelCode(channel)
        //.locationCode(location)
        .locationCode(location ? location : "*")
        .endTime(endTime.toISO());

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
        .bindPopup(`Lat: ${point.latLng.lat}<br>Lng: ${point.latLng.lng}<br>starttime: ${point.startTime || 'N/A'}<br>endtime: ${point.endTime || 'N/A'} <br>magnitude: ${point.mag}<br>depth: ${point.depth}`, { autoPan: false });

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
              plotStations(getRequest.result, point);
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














function plotStations(points, quake) {
  let maxGraphCount = 5;
  stationMarkers.forEach(marker => map.removeLayer(marker));
  stationMarkers = [];

  const waveForms = fetchWaveformsBulk(points, quake);
  document.querySelector("#myseismograph").innerHTML = "";

  let graphCount = 0; 
  waveForms.then(waveforms => {
    waveforms.forEach(waveform => {
waveform.querySeismograms(true)
  .then((seisArray) => {
    if (graphCount > maxGraphCount){
      return;
    }
    const div = document.querySelector("div#myseismograph");
    let seisData = [];
    for (let s of seisArray) {
      if (s.isContiguous() && s.y && s.y.length > 0){
        seisData.push(sp.seismogram.SeismogramDisplayData.fromSeismogram(s));
      } else {
        for (let segment of s.segments) {
          if (segment.y && segment.y.length > 0) {
            seisData.push(sp.seismogram.SeismogramDisplayData.fromSeismogramSegment(segment));
          }
        }
      }

    }

    if (seisData.length === 0) {
      //console.warn("No seismogram data found: ",seisArray);
      return;
    }

    let seisConfig = new sp.seismographconfig.SeismographConfig();
    let graph = new sp.seismograph.Seismograph(seisData, seisConfig);
    div.appendChild(graph);
    for (let point of points){
      if (point.station === waveform._stationCode) {
        mapStation(point);
        graphCount += 1;
        break;
      }
    }
  })
  .catch(function (error) {
    const div = document.querySelector("div#myseismograph");
    div.innerHTML = `<p>Error loading data. ${error}</p>`;
    console.assert(false, error);
  });

    });
  });
}



      





function mapStation(point){
      if (point.latLng && typeof point.latLng.lat === 'number' && typeof point.latLng.lng === 'number') {
        const customIcon = L.icon({
          iconUrl: point.icon,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -15]
        });

        const marker = L.marker([point.latLng.lat, point.latLng.lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(`Lat: ${point.latLng.lat}<br>Lng: ${point.latLng.lng}`, { autoPan: false });

        marker.on('click', function () {
          document.body.style.cursor = 'default';
          map.dragging.enable();
        });

        stationMarkers.push(marker);
      }


}