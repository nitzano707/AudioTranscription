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

    const maxSizeMB = 25;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    let transcriptionData = [];

    // אם הקובץ קטן מ-25 מגה-בייט, נשלח אותו כיחידה אחת
    if (audioFile.size <= maxSizeBytes) {
        await processAudioChunk(audioFile, transcriptionData, 1, 1, progressLabel, progressBar);
    } else {
        // פיצול הקובץ לחלקים של 9 דקות ושמירת סוג הקובץ
        const chunks = await splitAndProcessAudio(audioFile, 9 * 60); // פיצול ל-9 דקות
        const totalChunks = chunks.length;

        for (let i = 0; i < totalChunks; i++) {
            const chunkFile = new File([chunks[i]], `chunk_${i + 1}.${audioFile.name.split('.').pop()}`, { type: audioFile.type });
            
            progressBar.value = (i / totalChunks) * 100;
            progressLabel.textContent = `מעבד חלק ${i + 1} מתוך ${totalChunks}...`;

            await processAudioChunk(chunkFile, transcriptionData, i + 1, totalChunks, progressLabel, progressBar);

            await new Promise(resolve => setTimeout(resolve, 500));
        }
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

async function splitAndProcessAudio(file, chunkDuration) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const totalDuration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    let currentTime = 0;
    const chunks = [];

    while (currentTime < totalDuration) {
        const end = Math.min(currentTime + chunkDuration, totalDuration);
        const frameCount = Math.floor((end - currentTime) * sampleRate);

        // יצירת AudioBuffer חדש עבור כל מקטע
        const chunkBuffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

        for (let channel = 0; channel < numChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel).slice(
                Math.floor(currentTime * sampleRate),
                Math.floor(end * sampleRate)
            );
            chunkBuffer.copyToChannel(channelData, channel);
        }

        const blob = await bufferToBlob(chunkBuffer, file.type);
        chunks.push(blob);
        currentTime = end;
    }

    return chunks;
}

async function bufferToBlob(audioBuffer, mimeType) {
    const offlineContext = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start();
    const renderedBuffer = await offlineContext.startRendering();

    const arrayBuffer = await renderedBuffer.arrayBuffer();
    return new Blob([arrayBuffer], { type: mimeType });
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
