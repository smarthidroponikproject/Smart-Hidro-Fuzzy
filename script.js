const brokerUrl = 'wss://broker.emqx.io:8084/mqtt'; 
const topicSensor = 'hidroponik/projek_kkn_2026/sensors';
const topicControl = 'hidroponik/projek_kkn_2026/control';

const clientId = 'WebClient_' + Math.random().toString(16).substr(2, 8);
const client = mqtt.connect(brokerUrl, { clientId: clientId });

let currentMode = 'auto';
let relayStates = { airBersih: 'OFF', phUp: 'OFF', phDown: 'OFF', nutAB: 'OFF', exhaust: 'OFF' };

let sessionData = []; 
let offlineTimer;

function addLog(message) {
  const time = new Date().toLocaleTimeString('id-ID');
  const logBox = document.getElementById('event-log');
  const newLog = document.createElement('div');
  newLog.innerHTML = `<strong>[${time}]</strong> ${message}`;
  logBox.insertBefore(newLog, logBox.firstChild);
}

function setDeviceOnline() {
  const espStatus = document.getElementById('esp-status');
  espStatus.innerText = 'Alat: Online';
  espStatus.style.backgroundColor = '#A4BE7B';
  espStatus.style.color = '#285430';
  
  clearTimeout(offlineTimer);
  offlineTimer = setTimeout(() => {
    espStatus.innerText = 'Alat: Offline (No Data)';
    espStatus.style.backgroundColor = '#ffcccc';
    espStatus.style.color = '#cc0000';
    addLog("PERINGATAN: Tidak ada data dari ESP32 selama 15 detik (Offline).");
  }, 15000); 
}

client.on('connect', () => {
  const webStatus = document.getElementById('web-status');
  webStatus.innerText = 'Dashboard Terhubung (MQTT)';
  webStatus.style.backgroundColor = '#A4BE7B';
  webStatus.style.color = '#285430';
  
  client.subscribe(topicSensor);
  addLog("Terhubung ke Server MQTT. Menunggu pengiriman data pertama...");
});

function checkStatus(value, min, max, type) {
  if (type === 'range') {
    if (value < min) return { text: 'Rendah', class: 'text-warning' };
    if (value > max) return { text: 'Tinggi', class: 'text-danger' };
  } else if (type === 'maxOnly') {
    if (value > max) return { text: 'Tinggi (Bahaya)', class: 'text-danger' };
  }
  return { text: 'Normal', class: 'text-safe' };
}

client.on('message', (topic, message) => {
  if (topic === topicSensor) {
    try {
      const data = JSON.parse(message.toString());
      const timeStr = new Date().toLocaleTimeString('id-ID');
      
      setDeviceOnline();
      document.getElementById('last-update').innerText = timeStr;

      const tPhMin = parseFloat(document.getElementById('set-phMin').value);
      const tPhMax = parseFloat(document.getElementById('set-phMax').value);
      const tTdsMin = parseInt(document.getElementById('set-tdsMin').value);
      const tTdsMax = parseInt(document.getElementById('set-tdsMax').value);
      const tTempMax = parseFloat(document.getElementById('set-tempMax').value);
      const tWaterMax = parseFloat(document.getElementById('set-waterTempMax').value);
      const tHumMax = parseFloat(document.getElementById('set-humMax').value);

      const statPh = checkStatus(data.ph, tPhMin, tPhMax, 'range');
      const statTds = checkStatus(data.tds, tTdsMin, tTdsMax, 'range');
      const statWater = checkStatus(data.water_temp, 0, tWaterMax, 'maxOnly');
      const statAir = checkStatus(data.air_temp, 0, tTempMax, 'maxOnly');
      const statHum = checkStatus(data.humidity, 0, tHumMax, 'maxOnly');

      document.getElementById('val-ph').innerText = data.ph.toFixed(1);
      document.getElementById('val-ph').className = `value ${statPh.class}`;
      document.getElementById('stat-ph').innerHTML = `<span class="${statPh.class}">${statPh.text}</span>`;

      document.getElementById('val-tds').innerText = data.tds;
      document.getElementById('val-tds').className = `value ${statTds.class}`;
      document.getElementById('stat-tds').innerHTML = `<span class="${statTds.class}">${statTds.text}</span>`;

      const wTemp = data.water_temp > -100 ? data.water_temp.toFixed(1) : 'ERR';
      document.getElementById('val-watertemp').innerText = wTemp;
      document.getElementById('val-watertemp').className = `value ${statWater.class}`;
      document.getElementById('stat-watertemp').innerHTML = data.water_temp > -100 ? `<span class="${statWater.class}">${statWater.text}</span>` : 'Sensor Error';

      document.getElementById('val-airtemp').innerText = data.air_temp.toFixed(1);
      document.getElementById('val-airtemp').className = `value ${statAir.class}`;
      document.getElementById('stat-airtemp').innerHTML = `<span class="${statAir.class}">${statAir.text}</span>`;

      document.getElementById('val-hum').innerText = data.humidity.toFixed(0);
      document.getElementById('val-hum').className = `value ${statHum.class}`;
      document.getElementById('stat-hum').innerHTML = `<span class="${statHum.class}">${statHum.text}</span>`;

      sessionData.push({ time: timeStr, ph: data.ph, tds: data.tds, waterTemp: data.water_temp, airTemp: data.air_temp, hum: data.humidity });

      if(currentMode !== data.mode) {
        currentMode = data.mode;
        addLog(`Mode sistem berubah menjadi: ${currentMode.toUpperCase()}`);
        updateModeUI();
      }

      const newRelayStates = { airBersih: data.relay_air, phUp: data.relay_ph_up, phDown: data.relay_ph_down, nutAB: data.relay_nut_ab, exhaust: data.relay_exhaust };
      for (const key in newRelayStates) {
        if (newRelayStates[key] !== relayStates[key]) {
          addLog(`Aktuator <strong>${key}</strong> diubah ke: ${newRelayStates[key]}`);
        }
      }
      relayStates = newRelayStates;
      updateRelayUI();

    } catch (e) { console.error("Gagal memparsing JSON: ", e); }
  }
});

function setMode(mode) { client.publish(topicControl, JSON.stringify({ mode: mode })); }

function toggleRelay(relayId) {
  if (currentMode !== 'manual') { alert("Ubah ke Mode MANUAL terlebih dahulu."); return; }
  const newState = relayStates[relayId] === 'ON' ? 'OFF' : 'ON';
  client.publish(topicControl, JSON.stringify({ relay: relayId, state: newState }));
}

function saveSettings() {
  const payload = JSON.stringify({
    settings: true,
    phMin: parseFloat(document.getElementById('set-phMin').value), phMax: parseFloat(document.getElementById('set-phMax').value),
    tdsMin: parseInt(document.getElementById('set-tdsMin').value), tdsMax: parseInt(document.getElementById('set-tdsMax').value),
    tempMax: parseFloat(document.getElementById('set-tempMax').value), waterTempMax: parseFloat(document.getElementById('set-waterTempMax').value),
    humMax: parseFloat(document.getElementById('set-humMax').value)
  });
  client.publish(topicControl, payload);
  addLog("Pengaturan Threshold dikirim ke alat.");
  alert("Pengaturan berhasil dikirim!");
}

function exportCSV() {
  if (sessionData.length === 0) { alert("Belum ada data untuk diekspor!"); return; }
  let csvContent = "Waktu,pH,TDS (ppm),Suhu Air (C),Suhu Udara (C),Kelembapan (%)\n";
  sessionData.forEach(row => { csvContent += `${row.time},${row.ph.toFixed(1)},${row.tds},${row.waterTemp.toFixed(1)},${row.airTemp.toFixed(1)},${row.hum.toFixed(0)}\n`; });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Data_Hidroponik_${new Date().toLocaleDateString('id-ID')}.csv`;
  link.click();
  addLog("Data diunduh (CSV).");
}

function updateModeUI() {
  document.getElementById('btn-auto').classList.toggle('active', currentMode === 'auto');
  document.getElementById('btn-manual').classList.toggle('active', currentMode === 'manual');
  document.querySelectorAll('.relay-grid .btn').forEach(btn => btn.disabled = currentMode === 'auto');
}

function updateRelayUI() {
  const mapping = { 'rel-airBersih': 'Air Bersih', 'rel-phUp': 'pH Up', 'rel-phDown': 'pH Down', 'rel-nutAB': 'Nutrisi AB', 'rel-exhaust': 'Exhaust' };
  for (const [id, label] of Object.entries(mapping)) {
    const btn = document.getElementById(id);
    btn.innerText = `${label}: ${relayStates[id.replace('rel-', '')]}`;
    btn.classList.toggle('active', relayStates[id.replace('rel-', '')] === 'ON');
  }
}