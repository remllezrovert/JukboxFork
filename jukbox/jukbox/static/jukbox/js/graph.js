window.addEventListener("load", () => {
  const sp = window.sp;
  const { DateTime } = sp.luxon;
  let seis = null;
  const rtConfig = new sp.seismographconfig.SeismographConfig();
  rtConfig.title = "Live Stream";
  const rtDisp = sp.animatedseismograph.createRealtimeDisplay(rtConfig);
  const displayDiv = document.querySelector("#display");
  displayDiv.innerHTML = "";
  displayDiv.appendChild(rtDisp.organizedDisplay);

  let ws = null;
  let reconnectTimeout = null;

  function connectWebSocket() {
    if (ws) return;

    ws = new WebSocket("ws://localhost:8087");

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ subscribe: "NL.HGN" }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (typeof msg.start !== "number" || !Array.isArray(msg.data)) return;

      const startTime = DateTime.fromMillis(msg.start, { zone: "utc" });
      const values = Float32Array.from(msg.data);

      if (!seis) {
        seis = sp.seismogram.Seismogram.fromContiguousData(values, msg.sampleRate, startTime);
        const sdd = sp.seismogram.SeismogramDisplayData.fromSeismogram(seis);
        rtDisp.organizedDisplay.seisData = [sdd];
      } else {
        try {
            seis = seis.append(sp.seismogram.Seismogram.fromContiguousData(values, msg.sampleRate, startTime))

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

  connectWebSocket();

  rtDisp.animationScaler.minRedrawMillis = sp.animatedseismograph.calcOnePixelDuration(rtDisp.organizedDisplay);
  rtDisp.animationScaler.animate();

  window.addEventListener("beforeunload", () => {
    if (ws) ws.close(1000, "Page unload");
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  });
});


