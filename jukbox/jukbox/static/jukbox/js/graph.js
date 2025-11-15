window.addEventListener("load", () => {
  const sp = window.sp;
  const { DateTime } = sp.luxon;

  let ws = null;
  let reconnectTimeout = null;


//testing
//function findKey(obj, target, seen = new WeakSet(), path = '') {
//  if (!obj || typeof obj !== 'object') return null;
//  if (seen.has(obj)) return null;  // avoid circular references
//  seen.add(obj);
//
//  for (const key of Object.keys(obj)) {
//    const newPath = path ? `${path}.${key}` : key;
//    if (key === target) return newPath;
//    const nested = findKey(obj[key], target, seen, newPath);
//    if (nested) return nested;
//  }
//
//  return null;
//}
//
//const path = findKey(sp, 'FDSNSourceId');
//console.log('Found at:', path);
//
//end testing





  let graphs = new Map();

  function connectWebSocket() {

    if (ws) return;

    ws = new WebSocket("ws://localhost:8087");

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ subscribe: "NL.HGN" }));
    };

    const checkGraphExists = (id) => {
      for (let [k, v] of graphs) {
        if (k === id) {
          return true;
        }

      }
      return false;
    };

    ws.onmessage = (event) => {
      let seis = null;
      const msg = JSON.parse(event.data);
      console.log("Received message:", msg);
      if (typeof msg.start !== "number" || !Array.isArray(msg.data)) return;

      let startTime = DateTime.fromMillis(msg.start, { zone: "utc" });
      const values = Float32Array.from(msg.data);
        const sourceId = sp.fdsnsourceid.FDSNSourceId.fromNslc(
            msg.network,
            msg.station,
            msg.location || "",
            msg.channel
        );

      if (checkGraphExists(sourceId.toString()) === false) {

        seis = sp.seismogram.Seismogram.fromContiguousData(
          values,
          msg.sampleRate,
          startTime,
          sourceId
        );

        const sdd = sp.seismogram.SeismogramDisplayData.fromSeismogram(seis);


        rtDisp.organizedDisplay.seisData.push(sdd);



        graphs.set(sourceId.toString(), seis);

      } else {
        try {

          graphs.get(sourceId.toString()).append(
            sp.seismogram.Seismogram.fromContiguousData(
              values,
              msg.sampleRate,
              startTime,
              sourceId
            )
          );

        } catch (err) {
          console.error("Append failed:", err);
        }
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed", event.code, event.reason);
      ws = null;

      if (event.code !== 1000) {
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
  }
        const rtConfig = new sp.seismographconfig.SeismographConfig();
        const rtDisp = sp.animatedseismograph.createRealtimeDisplay(rtConfig);
        rtConfig.title = "Live Stream";
        const displayDiv = document.querySelector("#display");

        rtDisp.animationScaler.minRedrawMillis = sp.animatedseismograph.calcOnePixelDuration(rtDisp.organizedDisplay);
        rtDisp.animationScaler.animate();

        displayDiv.appendChild(rtDisp.organizedDisplay);


  connectWebSocket();

  window.addEventListener("beforeunload", () => {
    if (ws) ws.close(1000, "Page unload");
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  });
});
