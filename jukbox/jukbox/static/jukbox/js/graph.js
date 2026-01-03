






let urlParams=  new URLSearchParams(window.location.search);



window.addEventListener("load", () => {
  let urlParams=  new URLSearchParams(window.location.search);

  const sp = window.sp;
  const { DateTime } = sp.luxon;



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

let c1 = document.getElementById("column1");
let c2 = document.getElementById("column2");

document.getElementById("column2");




const subParams = urlParams.get("sub").split(",");
    if (!subParams) {
      subParams = ['test']
    }
    for (sub of subParams){
      connectWebSocket(sub,c1,c2);
    }


  raspberryShakeLiveEmbeds(c1,c2);

 
function raspberryShakeLiveEmbeds(c1,c2) {

let  pi = urlParams.get("pi");
for (let piStream of pi.split(",")) {
  piStream = piStream.replace(/\./g, "/");

  const wrapper = document.createElement("div");
  wrapper.setAttribute("style", "width:90%; height:90%; overflow:hidden; position:relative;");

  wrapper.classList.add("image-item"); // CSS applies here

  const iframe = document.createElement("iframe");
  iframe.width = 500;
  iframe.height = 350;
  iframe.src = `https://dataview.raspberryshake.org/#/embed/${piStream}`;
  iframe.style.border = "0";

  wrapper.appendChild(iframe);
  c1.appendChild(wrapper);
}
dragula([c1, c2], {
  moves: (el, source, handle, sibling) => {
    return el.classList.contains("image-item");
  }
});

}
})



























  function connectWebSocket(sub, c1,c2) {

    let ws = null;
    let reconnectTimeout = null;
    if (ws) return;
    //let defaultws = "ws://localhost:8087"

    
    let pubSub =  `wss://ws.jukbox.remllez.com/pubsub/${sub}/`;

    ws = new WebSocket(pubSub);
    let defaultStation = "NL.HGN";
    ws.onopen = () => {
      console.log("WebSocket connected");

      ws.send(JSON.stringify({ channels: true }));
      ws.send(JSON.stringify({ subscribe: defaultStation}));
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

        const rtConfig = new sp.seismographconfig.SeismographConfig();
        const rtDisp = sp.animatedseismograph.createRealtimeDisplay(rtConfig);
        rtConfig.title = "Live Stream";
        //const displayDiv = document.querySelector("#display");

        rtDisp.animationScaler.minRedrawMillis = sp.animatedseismograph.calcOnePixelDuration(rtDisp.organizedDisplay);
        rtDisp.animationScaler.animate();

        //displayDiv.appendChild(rtDisp.organizedDisplay);
        //displayDiv.style.width = "90%";
        rtDisp.organizedDisplay.classList.add("image-item");
        c2.appendChild(rtDisp.organizedDisplay);
        //const graphOnly = rtDisp.organizedDisplay.querySelector('sp-organized-display-item[plottype="seismograph"]');
        //c2.appendChild(graphOnly);

  window.addEventListener("beforeunload", () => {
      if (ws) ws.close(1000, "Page unload");
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    });

    ws.onclose = (event) => {
      console.log("WebSocket closed", event.code, event.reason);
      ws = null;

      if (event.code !== 1000) {
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
  }



