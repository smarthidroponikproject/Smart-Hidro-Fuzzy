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
let latestSensorData = null; 

let sessionData = []; 
let offlineTimer;

// ==========================================
// FUNGSI UTAMA (UI & SENSOR)
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
  offlineTimer = setTimeout(() => {
    espStatus.innerText = 'Alat: Offline (No Data)';
    espStatus.style.backgroundColor = '#ffcccc';
    espStatus.style.color = '#cc0000';
  }, 15000); 
}

client.on('connect', () => {
  client.subscribe(topicSensor);
  client.subscribe(topicStatus);
});

client.on('message', (topic, message) => {
  if (topic === topicSensor) {
    try {
      const data = JSON.parse(message.toString());
      latestSensorData = data; 
      setDeviceOnline();
      document.getElementById('last-update').innerText = new Date().toLocaleTimeString('id-ID');

      // Update UI Nilai Sensor
      document.getElementById('val-ph').innerText = data.ph.toFixed(1);
      document.getElementById('val-tds').innerText = data.tds;
      document.getElementById('val-watertemp').innerText = data.water_temp > -100 ? data.water_temp.toFixed(1) : 'ERR';
      document.getElementById('val-airtemp').innerText = data.air_temp.toFixed(1);
      document.getElementById('val-hum').innerText = data.humidity.toFixed(0);

      // Sinkronisasi Threshold UI
      if (data.phMin !== undefined) {
        document.getElementById('set-phMin').value = data.phMin;
        document.getElementById('set-phMax').value = data.phMax;
      }
    } catch (e) { console.error(e); }
  }
});

// ==========================================
// LOGIKA AI CHATBOT (GEMINI API)
// ==========================================
function toggleChat() {
  const chatWindow = document.getElementById('chat-window');
  chatWindow.classList.toggle('active'); 
}

function handleChatEnter(event) { if (event.key === 'Enter') sendChatMessage(); }

async function sendChatMessage() {
  const inputEl = document.getElementById('chat-input');
  const message = inputEl.value.trim();
  if (!message) return;

  appendMessage('user-msg', message);
  inputEl.value = '';
  const typingId = appendMessage('sys-msg', 'AI sedang menganalisis sensor...');

  let sensorContext = latestSensorData ? `Data saat ini: pH=${latestSensorData.ph}, TDS=${latestSensorData.tds}ppm, Suhu Air=${latestSensorData.water_temp}C.` : "Data sensor tidak tersedia.";

  const prompt = `Anda asisten hidroponik. Jawab ringkas berdasarkan data ini: ${sensorContext}. Pertanyaan: ${message}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    document.getElementById(typingId).remove();

    if (!response.ok) {
      appendMessage('sys-msg', `Error: ${data.error ? data.error.message : 'Koneksi gagal'}`);
    } else if (data.candidates) {
      appendMessage('ai-msg', data.candidates[0].content.parts[0].text);
    }
  } catch (error) {
    document.getElementById(typingId).remove();
    appendMessage('sys-msg', 'Gagal terhubung ke server AI.');
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
