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
        // פיצול הקובץ לחלקים של 9 דקות ושמירת סוג הקובץ
        const chunkSize = 9 * 60 * 1000; // 9 דקות במילישניות
        const totalChunks = Math.ceil(audioFile.size / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const chunkBlob = audioFile.slice(i * chunkSize, (i + 1) * chunkSize, audioFile.type);
            
            // עדכון חיווי התקדמות
            progressBar.value = (i / totalChunks) * 100;
            progressLabel.textContent = `מעבד חלק ${i + 1} מתוך ${totalChunks}...`;

            await processAudioChunk(chunkBlob, transcriptionData, i + 1, totalChunks, progressLabel, progressBar);

            // השהייה של חצי שנייה בין הבקשות כדי למנוע עומס
            await new Promise(resolve => setTimeout(resolve, 500));
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
    formData.append('file', chunk, 'audio.wav'); // מוודא שהפורמט נשמר כ-WAV

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
            const errorText = await response.text();
            progressLabel.textContent = `שגיאה בבקשה לחלק ${currentChunk}: ${response.status} - ${errorText}`;
            console.error(`Error for chunk ${currentChunk}:`, errorText);
        }
    } catch (error) {
        progressLabel.textContent = `אירעה שגיאה: ${error.message}`;
        console.error('Network error:', error);
    }
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
