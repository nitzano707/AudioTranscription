// בדיקה אם קוד ה-API קיים ב-Local Storage והפעלת המסך המתאים
window.onload = function() {
    console.log("window.onload מופעל");
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) {
        document.getElementById('mainContainer').style.display = 'block';
    } else {
        document.getElementById('apiKeyContainer').style.display = 'block';
    }
}

// פונקציה לשמירת קוד ה-API ב-Local Storage לאחר בדיקה
async function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput').value;
    if (apiKeyInput) {
        const isValid = await checkApiKey(apiKeyInput);
        if (isValid) {
            localStorage.setItem('apiKey', apiKeyInput);
            document.getElementById('apiKeyContainer').style.display = 'none';
            document.getElementById('mainContainer').style.display = 'block';
        } else {
            alert("קוד ה-API שהוזן אינו תקין או לא פעיל. אנא נסה שוב.");
        }
    } else {
        alert("אנא הכנס קוד API תקף.");
    }
}

// פונקציה לבדוק אם קוד ה-API תקין על ידי בקשת תמלול עם קובץ אודיו קיים ב-GitHub
async function checkApiKey(apiKey) {
    console.log("בודק את קוד ה-API:", apiKey);

    const audioUrl = 'https://raw.githubusercontent.com/username/repo-name/branch-name/assets/check_mp3.mp3';
    
    try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
            console.error("שגיאה בהורדת קובץ האודיו לבדיקה:", response.statusText);
            return false;
        }
        
        const audioBlob = await response.blob();
        const formData = new FormData();
        formData.append('file', audioBlob, 'check_mp3.mp3');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'verbose_json');
        formData.append('language', 'he');

        const apiResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        return apiResponse.ok;
    } catch (error) {
        console.error("שגיאה בלתי צפויה באימות ה-API:", error);
        return false;
    }
}

async function uploadAudio() {
    const responseDiv = document.getElementById('response');
    const audioFileInput = document.getElementById('audioFile');
    const downloadTxtBtn = document.getElementById('downloadTxtBtn');
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');
    const copyBtn = document.getElementById('copyBtn');
    const progressBar = document.getElementById('progressBar');

    if (!audioFileInput.files[0]) {
        responseDiv.innerHTML = '<p>אנא בחר קובץ אודיו.</p>';
        return;
    }

    const audioFile = audioFileInput.files[0];
    const audioFileName = audioFile.name;
    responseDiv.textContent = 'מעבד את הבקשה...';
    if (downloadTxtBtn) downloadTxtBtn.style.display = 'none';
    if (downloadCsvBtn) downloadCsvBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';

    let transcriptionData = [];

    const maxChunkSizeMB = 24;
    const maxChunkSizeBytes = maxChunkSizeMB * 1024 * 1024;
    const chunks = await splitAudioToChunksBySize(audioFile, maxChunkSizeBytes);
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
        const chunkFile = new File([chunks[i]], `chunk_${i + 1}.${audioFile.name.split('.').pop()}`, { type: audioFile.type });
        
        const progressPercent = Math.round(((i + 1) / totalChunks) * 100);
        if (progressBar) {
            progressBar.style.width = `${progressPercent}%`;
            progressBar.textContent = `${progressPercent}%`;
        }

        await processAudioChunk(chunkFile, transcriptionData, i + 1, totalChunks);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    responseDiv.innerHTML = transcriptionData.map(segment => {
        const startTime = formatTime(segment.start);
        return `<p><strong>${startTime}</strong><br>${segment.text}</p>`;
    }).join('');

    if (downloadTxtBtn) downloadTxtBtn.style.display = 'block';
    if (downloadCsvBtn) downloadCsvBtn.style.display = 'block';
    if (copyBtn) copyBtn.style.display = 'inline-block';
}

// פונקציה להורדת תמלול כ-CSV
function downloadTranscriptionAsCSV(data, fileName) {
    let csvContent = "\uFEFF"; // הוספת BOM
    csvContent += "חותמת זמן,תמלול\n";
    
    data.forEach(segment => {
        const startTime = formatTime(segment.start);
        const text = segment.text.replace(/,/g, ""); // הסרת פסיקים
        csvContent += `${startTime},${text}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName.replace(/\.[^/.]+$/, "")}_transcription.csv`;
    link.click();
}

// פונקציה להורדת תמלול כ-TXT
function downloadTranscription(data, fileName) {
    let textContent = `תמלול של קובץ אודיו: ${fileName}\n\n`;
    data.forEach(segment => {
        const startTime = formatTime(segment.start);
        textContent += `${startTime}: ${segment.text}\n`;
    });
    const blob = new Blob([textContent], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'transcription.txt';
    link.click();
}

// פונקציות עזר
function formatTime(seconds) {
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

async function splitAudioToChunksBySize(file, maxChunkSizeBytes) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const chunkDuration = maxChunkSizeBytes / (sampleRate * numChannels * 2);
    let currentTime = 0;
    const chunks = [];

    while (currentTime < audioBuffer.duration) {
        const end = Math.min(currentTime + chunkDuration, audioBuffer.duration);
        const frameCount = Math.floor((end - currentTime) * sampleRate);

        const chunkBuffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

        for (let channel = 0; channel < numChannels; channel++) {
            const originalChannelData = audioBuffer.getChannelData(channel);
            const chunkChannelData = chunkBuffer.getChannelData(channel);

            for (let i = 0; i < frameCount; i++) {
                chunkChannelData[i] = originalChannelData[Math.floor(currentTime * sampleRate) + i];
            }
        }

        const blob = bufferToWaveBlob(chunkBuffer);
        chunks.push(blob);
        currentTime = end;
    }

    return chunks;
}

function bufferToWaveBlob(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let offset = 0;
    let pos = 0;

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16);         // PCM format
    setUint16(1);          // format (PCM)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);

    setUint32(0x61746164); // "data
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4);

    for (let i = 0; i < abuffer.numberOfChannels; i++) {
        channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            const sample = Math.max(-1, Math.min(1, channels[i][offset]));
            view.setInt16(pos, sample < 0 ? sample * 32768 : sample * 32767, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });
}

// פונקציה לטיפול בתהליך תמלול של כל חלק בקובץ האודיו
async function processAudioChunk(chunk, transcriptionData, currentChunk, totalChunks) {
    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'he');

    const apiKey = localStorage.getItem('apiKey');
    try {
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            transcriptionData.push(...data.segments);
        } else {
            const errorText = await response.text();
            console.error(`Error for chunk ${currentChunk}/${totalChunks}:`, errorText);
        }
    } catch (error) {
        console.error('Network error:', error);
    }
}
