// === GLOBAL VARIABLES ===
let map, marker, watchId;
let path = [];
let routeData = [];
let lastCoords = null;
let totalDistance = 0;
let startTime = null;
let timerInterval = null;
let isPaused = false;
let elapsedTime = 0;
let mediaRecorder;
let audioChunks = [];

// === INIT MAP ===
window.initMap = function (callback) {
  const initial = path.length > 0 ? path[0] : { lat: 0, lng: 0 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 15,
    center: initial,
    mapTypeId: 'terrain'
  });

  marker = new google.maps.Marker({
    position: initial,
    map,
    title: "Start"
  });

  if (callback) callback();
};

// === TRACKING ===
window.startTracking = function () {
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      position => {
        const { latitude, longitude, accuracy } = position.coords;

        if (accuracy > 25) return;
        if (lastCoords) {
          const dist = haversineDistance(lastCoords, { lat: latitude, lng: longitude });
          if (dist > 0.2) return;
        }

        if (!isPaused) {
          const latLng = { lat: latitude, lng: longitude };

          if (lastCoords) {
            const dist = haversineDistance(lastCoords, latLng);
            totalDistance += dist;
            document.getElementById("distance").textContent = totalDistance.toFixed(2) + " km";
          }

          lastCoords = latLng;
          path.push(latLng);
          marker.setPosition(latLng);
          map.panTo(latLng);

          new google.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: "#00FF00",
            strokeOpacity: 1.0,
            strokeWeight: 2,
            map
          });

          routeData.push({
            type: "location",
            timestamp: Date.now(),
            coords: latLng
          });
        }
      },
      err => console.error("GPS error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    startTimer();
  } else {
    alert("Geolocation not supported");
  }
};

window.stopTracking = function () {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  stopTimer();
  showSummary();
};

window.togglePause = function () {
  isPaused = !isPaused;
  document.getElementById("pauseButtonLabel").textContent = isPaused ? "Resume" : "Pause";
  if (!isPaused) {
    startTime = Date.now() - elapsedTime;
    timerInterval = setInterval(updateTimerDisplay, 1000);
  } else {
    clearInterval(timerInterval);
  }
};

// === TIMER ===
function startTimer() {
  startTime = Date.now() - elapsedTime;
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const now = Date.now();
  elapsedTime = now - startTime;
  const hrs = Math.floor(elapsedTime / (1000 * 60 * 60));
  const mins = Math.floor((elapsedTime % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((elapsedTime % (1000 * 60)) / 1000);
  document.getElementById("timer").textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

// === DISTANCE ===
function haversineDistance(coord1, coord2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// === MEDIA CAPTURE ===
window.capturePhoto = () => document.getElementById("photoInput").click();
window.captureVideo = () => document.getElementById("videoInput").click();

window.addTextNote = function () {
  const note = prompt("Enter your note:");
  if (note) {
    navigator.geolocation.getCurrentPosition(position => {
      routeData.push({
        type: "text",
        timestamp: Date.now(),
        coords: { lat: position.coords.latitude, lng: position.coords.longitude },
        content: note
      });
      alert("Note saved.");
    });
  }
};

window.startAudioRecording = function () {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          navigator.geolocation.getCurrentPosition(pos => {
            routeData.push({
              type: "audio",
              timestamp: Date.now(),
              coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
              content: reader.result
            });
            alert("Audio saved.");
          });
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), 5000);
    })
    .catch(() => alert("Microphone access denied"));
};

// === MEDIA INPUT EVENTS ===
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("photoInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        navigator.geolocation.getCurrentPosition(pos => {
          routeData.push({
            type: "photo",
            timestamp: Date.now(),
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            content: reader.result
          });
          alert("Photo saved.");
        });
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById("videoInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        navigator.geolocation.getCurrentPosition(pos => {
          routeData.push({
            type: "video",
            timestamp: Date.now(),
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            content: reader.result
          });
          alert("Video saved.");
        });
      };
      reader.readAsDataURL(file);
    }
  });
});

// === SHOW ROUTE & NOTES ===
window.showRouteDataOnMap = function () {
  routeData.forEach(entry => {
    const { coords, type, content } = entry;
    let infoContent = "";

    if (type === "text") {
      infoContent = `<p>${content}</p>`;
    } else if (type === "photo") {
      infoContent = `<img src="${content}" style="width:150px" onclick="showMediaFullScreen('${content}', 'photo')" />`;
    } else if (type === "audio") {
      infoContent = `<audio controls src="${content}"></audio>`;
    } else if (type === "video") {
      infoContent = `<video controls width="200" src="${content}" onclick="showMediaFullScreen('${content}', 'video')"></video>`;
    } else return;

    const marker = new google.maps.Marker({ position: coords, map });
    const infoWindow = new google.maps.InfoWindow({ content: infoContent });

    marker.addListener("click", () => infoWindow.open(map, marker));
  });
};

// === FULLSCREEN MEDIA VIEWER ===
window.showMediaFullScreen = function (content, type) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.background = "rgba(0, 0, 0, 0.8)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "20px";
  closeBtn.style.right = "20px";
  closeBtn.style.padding = "10px 20px";
  closeBtn.style.backgroundColor = "#f44336";
  closeBtn.style.color = "#fff";
  closeBtn.onclick = () => document.body.removeChild(overlay);

  overlay.appendChild(closeBtn);

  const media = document.createElement(type === "photo" ? "img" : "video");
  media.src = content;
  media.style.maxWidth = "90%";
  media.style.maxHeight = "90%";
  if (type === "video") media.controls = true;

  overlay.appendChild(media);
  document.body.appendChild(overlay);
};

// === SAVE SESSION ===
window.saveSession = function () {
  const name = prompt("Enter a name for this route:");
  if (!name) return;

  const sessions = JSON.parse(localStorage.getItem("sessions") || "[]");

  sessions.push({
    name,
    date: new Date().toISOString(),
    time: document.getElementById("timer").textContent,
    distance: totalDistance.toFixed(2),
    data: routeData
  });

  localStorage.setItem("sessions", JSON.stringify(sessions));
  alert("Route saved!");
  loadSavedSessions();
};

// === LOAD SESSION LIST ===
window.loadSavedSessions = function () {
  const list = document.getElementById("savedSessionsList");
  list.innerHTML = "";
  const sessions = JSON.parse(localStorage.getItem("sessions") || "[]");

  sessions.forEach((session, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${session.name}</strong>
      <button onclick="loadSession(${index})">View</button>
    `;
    list.appendChild(li);
  });
};

// === LOAD A SESSION ===
window.loadSession = function (index) {
  const sessions = JSON.parse(localStorage.getItem("sessions") || "[]");
  const session = sessions[index];

  routeData = session.data;
  totalDistance = parseFloat(session.distance);
  document.getElementById("timer").textContent = session.time;
  document.getElementById("distance").textContent = totalDistance.toFixed(2) + " km";

  path = [];
  routeData.forEach(entry => {
    if (entry.type === "location") {
      path.push(entry.coords);
    }
  });

  window.initMap(() => {
    drawSavedRoutePath();
    showRouteDataOnMap();
  });
};

function drawSavedRoutePath() {
  if (path.length > 1) {
    new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#00FF00",
      strokeOpacity: 1.0,
      strokeWeight: 3,
      map
    });

    map.setCenter(path[0]);
    marker.setPosition(path[0]);
  }
}

// === EXPORT JSON ===
window.exportData = function () {
  const fileName = `route-${new Date().toISOString()}.json`;
  const blob = new Blob([JSON.stringify(routeData, null, 2)], { type: "application/json" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// === EXPORT GPX ===
window.exportGPX = function () {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NatureTracker" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Route</name><trkseg>\n`;

  routeData
    .filter(e => e.type === "location")
    .forEach(e => {
      gpx += `<trkpt lat="${e.coords.lat}" lon="${e.coords.lng}">
  <time>${new Date(e.timestamp).toISOString()}</time>
</trkpt>\n`;
    });

  gpx += `</trkseg></trk></gpx>`;

  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `route-${Date.now()}.gpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// === EXPORT PDF ===
window.exportPDF = async function () {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 10;

  doc.setFontSize(16);
  doc.text("Nature Tracker - Route Summary", 10, y); y += 10;

  for (const entry of routeData) {
    if (y > 260) { doc.addPage(); y = 10; }

    doc.setFontSize(12);
    doc.text(`Type: ${entry.type}`, 10, y); y += 6;
    doc.text(`Time: ${new Date(entry.timestamp).toLocaleString()}`, 10, y); y += 6;
    doc.text(`Lat: ${entry.coords.lat.toFixed(5)}, Lng: ${entry.coords.lng.toFixed(5)}`, 10, y); y += 6;

    if (entry.type === "text") {
      doc.text(`Note: ${entry.content}`, 10, y); y += 10;
    }
    else if (entry.type === "photo") {
      try {
        doc.addImage(entry.content, "JPEG", 10, y, 50, 40);
        y += 50;
      } catch {
        doc.text("Photo not embedded", 10, y); y += 10;
      }
    }
    else if (entry.type === "audio") {
      doc.text("Audio note recorded (not embeddable)", 10, y); y += 10;
    }
    else if (entry.type === "video") {
      doc.text("Video recorded (not embeddable)", 10, y); y += 10;
    }
  }

  doc.save(`route-${Date.now()}.pdf`);
};

// === SHAREABLE LINK ===
window.generateShareableLink = function () {
  const json = JSON.stringify(routeData);
  const base64 = btoa(json);
  const url = `${location.origin}${location.pathname}?data=${encodeURIComponent(base64)}`;

  navigator.clipboard.writeText(url)
    .then(() => alert("Shareable link copied to clipboard!"));
};

// === ON LOAD SHARED LINK HANDLER ===
window.onload = function () {
  const params = new URLSearchParams(window.location.search);
  const base64Data = params.get("data");
  if (base64Data) {
    try {
      const json = atob(base64Data);
      routeData = JSON.parse(json);
      alert("Shared route loaded!");
      path = routeData.filter(e => e.type === "location").map(e => e.coords);
      initMap(() => {
        drawSavedRoutePath();
        showRouteDataOnMap();
      });
    } catch (e) {
      console.error("Invalid share data.");
    }
  } else {
    loadSavedSessions();
  }
};
