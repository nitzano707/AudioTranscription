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
    const audioFile = document.getElementById('audioFile').files[0];
    const downloadBtn = document.getElementById('downloadTxtBtn');
    const downloadCSVBtn = document.getElementById('downloadCsvBtn');
    const copyBtn = document.getElementById('copyBtn');
    const progressBar = document.getElementById('progressBar');

    if (!responseDiv || !audioFile || !downloadBtn || !downloadCSVBtn || !copyBtn || !progressBar) {
        console.error("אחד או יותר מהאלמנטים לא נמצאו ב-DOM");
        return;
    }

    responseDiv.textContent = 'מעבד את הבקשה...';
    downloadBtn.style.display = 'none';
    downloadCSVBtn.style.display = 'none';
    copyBtn.style.display = 'none';

    const maxChunkSizeMB = 24;
    const maxChunkSizeBytes = maxChunkSizeMB * 1024 * 1024;
    let transcriptionData = [];

    const chunks = await splitAudioToChunksBySize(audioFile, maxChunkSizeBytes);
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
        const chunkFile = new File([chunks[i]], `chunk_${i + 1}.${audioFile.name.split('.').pop()}`, { type: audioFile.type });
        
        const progressPercent = Math.round(((i + 1) / totalChunks) * 100);
        progressBar.style.width = `${progressPercent}%`;
        progressBar.textContent = `${progressPercent}%`;

        await processAudioChunk(chunkFile, transcriptionData, i + 1, totalChunks, progressBar);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    let htmlContent = '';
    transcriptionData.forEach(segment => {
        const startTime = formatTime(segment.start);
        htmlContent += `<p><strong>${startTime}</strong><br>${segment.text}</p>`;
    });
    responseDiv.innerHTML = htmlContent;

    downloadBtn.style.display = 'block';
    downloadCSVBtn.style.display = 'block';
    copyBtn.style.display = 'inline-block';
}

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

function formatTime(seconds) {
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}
