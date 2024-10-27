function formatTime(seconds) {
    const ms = Math.floor((seconds % 1) * 10).toString().padStart(1, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    return `${m}:${s}.${ms}`;
}

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

    // בדיקת גודל הקובץ
    if (audioFile.size <= maxSizeBytes) {
        // הקובץ בגודל מתאים, שליחה כיחידה אחת
        await processAudioChunk(audioFile, transcriptionData, 1, 1, progressLabel, progressBar);
    } else {
        // פיצול הקובץ לחלקים של 5 דקות
        const chunkSize = 5 * 60 * 1000; // 5 דקות במילישניות
        const totalChunks = Math.ceil(audioFile.size / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const chunk = audioFile.slice(i * chunkSize, (i + 1) * chunkSize);
            
            // עדכון חיווי התקדמות
            progressBar.value = (i / totalChunks) * 100;
            progressLabel.textContent = `מעבד חלק ${i + 1} מתוך ${totalChunks}...`;

            await processAudioChunk(chunk, transcriptionData, i + 1, totalChunks, progressLabel, progressBar);
        }
    }

    // הצגת התמלול המלא
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
                'Authorization': 'Bearer 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' // יש להחליף במפתח ה-API האישי שלך
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            transcriptionData.push(...data.segments);
            progressBar.value = (currentChunk / totalChunks) * 100;
        } else {
            progressLabel.textContent = `שגיאה בבקשה לחלק ${currentChunk}: ${response.statusText}`;
            progressContainer.style.display = 'none';
        }
    } catch (error) {
        progressLabel.textContent = `אירעה שגיאה: ${error.message}`;
        progressContainer.style.display = 'none';
    }
}
