
console.log("map.js loaded");

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

async function saveArrayToStoreIndexedDB(storeName,items){
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






async function saveDictToStoreIndexedDB(storeName,items){
    console.log("Saving items to IndexedDB store:", storeName, items);
    const db = await openDatabaseWithStores(["eventStore", "stationStore", "waveStore"]);
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);

  Object.entries(items).forEach(([key,value]) => {
    store.put(value,key);
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}











function clearMarkers(map)  {
    if (map.markers) {
        map.markers.forEach(marker => marker.remove());
    }
    map.markers = [];
}


function getAllEvents() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("MapDatabase", 1);
        request.onsuccess = function(event) {
            const db = event.target.result;
            const tx = db.transaction("eventStore", "readonly");
            const store = tx.objectStore("eventStore");
            const allEventsRequest = store.getAll();

            allEventsRequest.onsuccess = function() {
                resolve(allEventsRequest.result);
            };
            allEventsRequest.onerror = function() {
                reject(allEventsRequest.error);
            };
        };
        request.onerror = function() {
            reject(request.error);
        };
    });
  }

  function plotPoints(points) {
    points.forEach(point => {
      if (typeof point.lat === 'number' && typeof point.lon === 'number') {
        L.marker([point.lat, point.lon])
          .addTo(map)
          .bindPopup(`Lat: ${point.lat}<br>Lon: ${point.lon}<br>starttime: ${point.starttime || 'N/A'}<br>endtime: ${point.endtime || 'N/A'}`);
      }
    });

    if (points.length > 0) {
      const latlngs = points.map(p => [p.lat, p.lon]);
      map.fitBounds(latlngs);
    }
  }
