window.onload = function() {
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) {
        document.getElementById('mainContainer').style.display = 'block';
    } else {
        document.getElementById('apiKeyContainer').style.display = 'block';
    }
}

function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput').value;
    if (apiKeyInput) {
        localStorage.setItem('apiKey', apiKeyInput);
        document.getElementById('apiKeyContainer').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
    } else {
        alert("אנא הכנס קוד API תקף.");
    }
}

function getApiKey() {
    return localStorage.getItem('apiKey');
}

async function uploadAudio() {
    const responseDiv = document.getElementById('response');
    const audioFile = document.getElementById('audioFile').files[0];
    const downloadBtn = document.getElementById('downloadBtn');
    const progressBar = document.getElementById('progressBar');

    if (!audioFile) {
        responseDiv.innerHTML = '<p>אנא בחר קובץ אודיו.</p>';
        return;
    }

    responseDiv.textContent = 'מעבד את הבקשה...';
    downloadBtn.style.display = 'none';

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

    loadTranscriptionToIframe(transcriptionData);
    document.getElementById('copyBtn').style.display = 'inline-block'; // הצגת כפתור ההעתק
    downloadBtn.style.display = 'block';
    downloadBtn.onclick = () => downloadTranscription(transcriptionData, audioFile.name);
}

function loadTranscriptionToIframe(transcriptionData) {
    const iframe = document.getElementById('transcriptionIframe');
    const content = transcriptionData.map(segment => {
        const startTime = formatTime(segment.start);
        return `<p><strong>${startTime}</strong> ${segment.text}</p>`;
    }).join('');
    
    iframe.contentDocument.open();
    iframe.contentDocument.write(`<html><body dir="rtl" style="font-family: Arial, sans-serif;">${content}</body></html>`);
    iframe.contentDocument.close();
}

function copyTranscription() {
    const iframe = document.getElementById('transcriptionIframe');
    iframe.contentWindow.document.execCommand("selectAll");
    iframe.contentWindow.document.execCommand("copy");

    const copyMessage = document.getElementById('copyMessage');
    copyMessage.style.display = 'inline';

    const copyBtn = document.getElementById('copyBtn');
    copyBtn.innerHTML = '<i class="fas fa-check"></i> הועתק!';

    setTimeout(() => {
        copyMessage.style.display = 'none';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> העתק';
    }, 3000);
}

function formatTime(seconds) {
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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
