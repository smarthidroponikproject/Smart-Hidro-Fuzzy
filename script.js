// ==========================================
// PENGATURAN KUNCI API AI (GEMINI)
// ==========================================
const GEMINI_API_KEY = 'AQ.Ab8RN6Lue_q-bGf10S_lywqQMybUATit3ZzY3-9BFZbQYU4HjQ'; 

// ==========================================
// PENGATURAN MQTT
// ==========================================
const brokerUrl = 'wss://broker.emqx.io:8084/mqtt'; 
const topicSensor = 'hidroponik/projek_kkn_2026/sensors';
const topicControl = 'hidroponik/projek_kkn_2026/control';
const topicStatus = 'hidroponik/projek_kkn_2026/status';

const clientId = 'WebClient_' + Math.random().toString(16).substr(2, 8);
const client = mqtt.connect(brokerUrl, { clientId: clientId });

let currentMode = 'auto';
let relayStates = { airBersih: 'OFF', phUp: 'OFF', phDown: 'OFF', nutAB: 'OFF', exhaust: 'OFF' };
let latestSensorData = null; // Menyimpan data sensor terakhir untuk dibaca AI

let sessionData = []; 
let offlineTimer;

// ==========================================
// FUNGSI LOG AKTIVITAS & STATUS ALAT
// ==========================================
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
  // Jika 15 detik tidak ada data masuk, anggap ESP32 mati/offline
  offlineTimer = setTimeout(() => {
    espStatus.innerText = 'Alat: Offline (No Data)';
    espStatus.style.backgroundColor = '#ffcccc';
    espStatus.style.color = '#cc0000';
    addLog("PERINGATAN: Tidak ada data dari ESP32 selama 15 detik (Offline).");
  }, 15000); 
}

// ==========================================
// KONEKSI MQTT & PENERIMAAN DATA
// ==========================================
client.on('connect', () => {
  const webStatus = document.getElementById('web-status');
  webStatus.innerText = 'Dashboard Terhubung (MQTT)';
  webStatus.style.backgroundColor = '#A4BE7B';
  webStatus.style.color = '#285430';
  
  client.subscribe(topicSensor);
  client.subscribe(topicStatus);
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
  // Menangkap pesan LWT (Last Will & Testament) jika ESP32 putus daya
  if (topic === topicStatus) {
    const msgString = message.toString();
    if (msgString === 'Offline') {
      const espStatus = document.getElementById('esp-status');
      espStatus.innerText = 'Alat: Offline';
      espStatus.style.backgroundColor = '#ffcccc';
      espStatus.style.color = '#cc0000';
      clearTimeout(offlineTimer);
      addLog("PERINGATAN: ESP32 terputus dari jaringan (Offline).");
    }
  }

  // Menangkap data sensor rutin
  if (topic === topicSensor) {
    try {
      const data = JSON.parse(message.toString());
      latestSensorData = data; 
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

      // Evaluasi status aman/bahaya
      const statPh = checkStatus(data.ph, tPhMin, tPhMax, 'range');
      const statTds = checkStatus(data.tds, tTdsMin, tTdsMax, 'range');
      const statWater = checkStatus(data.water_temp, 0, tWaterMax, 'maxOnly');
      const statAir = checkStatus(data.air_temp, 0, tTempMax, 'maxOnly');
      const statHum = checkStatus(data.humidity, 0, tHumMax, 'maxOnly');

      // Tampilkan angka ke UI Web
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

      // Sinkronisasi angka input threshold jika dikirim oleh ESP32
      if (data.phMin !== undefined) {
        document.getElementById('set-phMin').value = data.phMin;
        document.getElementById('set-phMax').value = data.phMax;
        document.getElementById('set-tdsMin').value = data.tdsMin;
        document.getElementById('set-tdsMax').value = data.tdsMax;
        document.getElementById('set-tempMax').value = data.tempMax;
        document.getElementById('set-waterTempMax').value = data.waterTempMax;
        document.getElementById('set-humMax').value = data.humMax;
      }

      // Simpan riwayat untuk Export CSV
      sessionData.push({ time: timeStr, ph: data.ph, tds: data.tds, waterTemp: data.water_temp, airTemp: data.air_temp, hum: data.humidity });

      // Cek perubahan mode
      if(currentMode !== data.mode) {
        currentMode = data.mode;
        addLog(`Mode sistem berubah menjadi: ${currentMode.toUpperCase()}`);
        updateModeUI();
      }

      // Cek perubahan status relay
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

// ==========================================
// FUNGSI PANEL KONTROL & PENGATURAN
// ==========================================
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
  addLog("Pengaturan Threshold dikirim ke ESP32.");
  alert("Pengaturan berhasil disimpan di memori ESP32!");
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
  addLog("Data sensor berhasil diunduh (CSV).");
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

// ==========================================
// LOGIKA AI CHATBOT (GEMINI API)
// ==========================================
function toggleChat() {
  const chatWindow = document.getElementById('chat-window');
  // Menggunakan class 'active' agar pop-up berfungsi sebagaimana mestinya
  chatWindow.classList.toggle('active'); 
}

function handleChatEnter(event) {
  if (event.key === 'Enter') sendChatMessage();
}

async function sendChatMessage() {
  const inputEl = document.getElementById('chat-input');
  const message = inputEl.value.trim();
  if (!message) return;

  appendMessage('user-msg', message);
  inputEl.value = '';
  
  const typingId = appendMessage('sys-msg', 'AI sedang menganalisis sensor...');

  // Siapkan konteks sensor untuk disuntikkan ke AI
  let sensorContext = "Belum ada data sensor.";
  if (latestSensorData) {
    sensorContext = `Data Sensor Saat Ini: pH=${latestSensorData.ph.toFixed(1)}, TDS=${latestSensorData.tds}ppm, Suhu Air=${latestSensorData.water_temp.toFixed(1)}C, Suhu Udara=${latestSensorData.air_temp.toFixed(1)}C, Kelembapan=${latestSensorData.humidity.toFixed(0)}%. Mode Sistem=${currentMode}. Status Pompa: Air Bersih=${relayStates.airBersih}, Nutrisi=${relayStates.nutAB}, pH Up=${relayStates.phUp}, pH Down=${relayStates.phDown}, Exhaust=${relayStates.exhaust}.`;
  }

  const prompt = `Anda adalah Asisten Hidroponik AI cerdas untuk proyek KKN mahasiswa. Anda ramah, membantu, dan menggunakan bahasa Indonesia yang baik. Jawab pertanyaan pengguna secara ringkas, jelas, dan santai, maksimal 2-3 paragraf pendek. JANGAN membuat format tebal (bold) berlebihan. Gunakan konteks data alat hidroponik berikut untuk menjawab secara akurat jika relevan. \n\n${sensorContext}\n\nPertanyaan Pengguna: ${message}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    document.getElementById(typingId).remove(); // Hapus tulisan typing

    if (data.candidates && data.candidates.length > 0) {
      const aiReply = data.candidates[0].content.parts[0].text;
      appendMessage('ai-msg', aiReply);
    } else {
      appendMessage('ai-msg', 'Maaf, saya tidak bisa memproses pertanyaan tersebut saat ini.');
    }
  } catch (error) {
    console.error(error);
    document.getElementById(typingId).remove();
    appendMessage('ai-msg', 'Gagal terhubung ke server AI. Pastikan API Key Anda sudah benar.');
  }
}

function appendMessage(className, text) {
  const msgContainer = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${className}`;
  msgDiv.innerHTML = text.replace(/\n/g, '<br>');
  msgDiv.id = 'msg-' + Date.now();
  msgContainer.appendChild(msgDiv);
  msgContainer.scrollTop = msgContainer.scrollHeight;
  return msgDiv.id;
}
