async function uploadAudio() {
    const responseDiv = document.getElementById('response');
    const audioFile = document.getElementById('audioFile').files[0];
    const downloadBtn = document.getElementById('downloadBtn');
    const progressBar = document.getElementById('progressBar');
    const progressContainer = document.getElementById('progressContainer');
    const progressLabel = document.getElementById('progressLabel');

    if (!audioFile) {
        responseDiv.innerHTML = '<p>אנא בחר קובץ אודיו.</p>';
        return;
    }

    responseDiv.textContent = 'מעבד את הבקשה...';
    downloadBtn.style.display = 'none';
    progressContainer.style.display = 'block';

    const maxChunkSizeMB = 24;
    const maxChunkSizeBytes = maxChunkSizeMB * 1024 * 1024;
    let transcriptionData = [];

    const chunks = await splitAudioToChunksBySize(audioFile, maxChunkSizeBytes);
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
        const chunkFile = new File([chunks[i]], `chunk_${i + 1}.${audioFile.name.split('.').pop()}`, { type: audioFile.type });
        
        progressBar.value = (i / totalChunks) * 100;
        progressLabel.textContent = `מעבד חלק ${i + 1} מתוך ${totalChunks}...`;

        await processAudioChunk(chunkFile, transcriptionData, i + 1, totalChunks, progressLabel, progressBar);

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    let htmlContent = '';
    transcriptionData.forEach(segment => {
        const startTime = formatTime(segment.start);
        htmlContent += `<p><strong>${startTime}</strong><br>${segment.text}</p>`;
    });
    responseDiv.innerHTML = htmlContent;
    downloadBtn.style.display = 'block';
    downloadBtn.onclick = () => downloadTranscription(transcriptionData, audioFile.name);
    progressContainer.style.display = 'none';
}

async function splitAudioToChunksBySize(file, maxChunkSizeBytes) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const chunkDuration = maxChunkSizeBytes / (sampleRate * numChannels * 2); // חישוב משך כל חלק בנתוני הקובץ
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

async function processAudioChunk(chunk, transcriptionData, currentChunk, totalChunks, progressLabel, progressBar) {
    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'he');

    try {
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer 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'
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            transcriptionData.push(...data.segments);
            progressBar.value = (currentChunk / totalChunks) * 100;
        } else {
            const errorText = await response.text();
            progressLabel.textContent = `שגיאה בבקשה לחלק ${currentChunk}: ${response.status} - ${errorText}`;
            console.error(`Error for chunk ${currentChunk}:`, errorText);
        }
    } catch (error) {
        progressLabel.textContent = `אירעה שגיאה: ${error.message}`;
        console.error('Network error:', error);
    }
}

function formatTime(seconds) {
    const ms = Math.floor((seconds % 1) * 10).toString().padStart(1, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    return `${m}:${s}.${ms}`;
}

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
