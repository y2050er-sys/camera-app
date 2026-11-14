const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const message = document.getElementById("message");
const startBtn = document.getElementById("startBtn");
const captureBtn = document.getElementById("captureBtn");
const recordBtn = document.getElementById("recordBtn");
const switchBtn = document.getElementById("switchBtn");
const zoom = document.getElementById("zoom");
const flash = document.getElementById("flash");

let stream = null;
let facing = "environment";
let mediaRecorder = null;
let recording = false;
let photos = [];
let videos = [];
let filterIndex = 0;
let timer = 0;

const filters = [
    "none",
    "grayscale(100%)",
    "sepia(100%)",
    "contrast(150%)",
    "saturate(200%)",
    "brightness(120%)",
    "hue-rotate(90deg)"
];

let db = null;

const dbRequest = indexedDB.open("CameraAppDB", 1);

dbRequest.onupgradeneeded = event => {
    db = event.target.result;

    if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", {
            keyPath: "id",
            autoIncrement: true
        });
    }
};

dbRequest.onsuccess = event => {
    db = event.target.result;
    updateGallery();
};

dbRequest.onerror = () => {
    console.error("تعذر فتح قاعدة البيانات");
};

async function startCamera() {
    try {
        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {
            throw new Error("المتصفح لا يدعم تشغيل الكاميرا");
        }

        if (!window.isSecureContext) {
            throw new Error("يجب فتح التطبيق باستخدام اتصال آمن HTTPS");
        }

        message.style.display = "block";
        message.textContent = "جاري تشغيل الكاميرا...";

        let newStream;

        try {
            newStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: facing },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
        } catch (firstError) {
            newStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: true
            });
        }

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        stream = newStream;
        video.srcObject = stream;

        await video.play();

        message.style.display = "none";
        startBtn.style.display = "none";

    } catch (error) {
        message.style.display = "block";
        message.textContent = "تعذر تشغيل الكاميرا";

        let errorMessage = "حدث خطأ أثناء تشغيل الكاميرا.";

        if (error.name === "NotAllowedError") {
            errorMessage = "اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح.";
        } else if (error.name === "NotFoundError") {
            errorMessage = "لم يتم العثور على كاميرا في الجهاز.";
        } else if (error.name === "NotReadableError") {
            errorMessage = "الكاميرا مستخدمة بواسطة تطبيق آخر.";
        } else if (error.message) {
            errorMessage = error.message;
        }

        alert(errorMessage);
        console.error(error);
    }
}

startBtn.onclick = startCamera;

captureBtn.onclick = async () => {
    if (!stream) {
        return alert("شغّل الكاميرا أولاً");
    }

    if (timer > 0) {
        captureBtn.disabled = true;

        for (let i = timer; i > 0; i--) {
            message.style.display = "block";
            message.textContent = i;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        message.style.display = "none";
        captureBtn.disabled = false;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.filter = filters[filterIndex];

    if (facing === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";

    canvas.toBlob(blob => {
        if (blob) saveMedia(blob, "image");
    }, "image/jpeg", 0.95);

    flash.style.opacity = "1";

    setTimeout(() => {
        flash.style.opacity = "0";
    }, 120);
};

function saveMedia(blob, type) {
    if (!db) {
        return alert("قاعدة البيانات لم تجهز بعد");
    }

    const transaction = db.transaction("media", "readwrite");

    transaction.objectStore("media").add({
        blob,
        type,
        date: new Date().toISOString()
    });

    transaction.oncomplete = updateGallery;
}

recordBtn.onclick = () => {
    if (!stream) {
        return alert("شغّل الكاميرا أولاً");
    }

    if (!window.MediaRecorder) {
        return alert("تسجيل الفيديو غير مدعوم في هذا المتصفح");
    }

    if (!recording) {
        const types = [
            "video/webm;codecs=vp9",
            "video/webm",
            "video/mp4"
        ];

        const mimeType = types.find(type =>
            MediaRecorder.isTypeSupported(type)
        );

        if (!mimeType) {
            return alert("تسجيل الفيديو غير مدعوم بهذا المتصفح");
        }

        mediaRecorder = new MediaRecorder(stream, {
            mimeType
        });

        videos = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data.size) {
                videos.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(videos, {
                type: mimeType
            });

            saveMedia(blob, "video");
        };

        mediaRecorder.start();
        recording = true;
        recordBtn.textContent = "■";

    } else {
        mediaRecorder.stop();
        recording = false;
        recordBtn.textContent = "●";
    }
};

switchBtn.onclick = async () => {
    facing = facing === "environment" ? "user" : "environment";
    await startCamera();
};

zoom.oninput = () => {
    const track = stream?.getVideoTracks()[0];

    if (!track) return;

    const capabilities = track.getCapabilities?.();

    if (capabilities?.zoom) {
        const value = Number(zoom.value);

        track.applyConstraints({
            advanced: [{ zoom: value }]
        }).catch(console.error);

    } else {
        video.style.transform = `scale(${zoom.value})`;
    }
};

document.getElementById("filterBtn").onclick = () => {
    filterIndex = (filterIndex + 1) % filters.length;
    video.style.filter = filters[filterIndex];
};

document.getElementById("gridBtn").onclick = () => {
    video.style.backgroundImage =
        video.style.backgroundImage
            ? ""
            : "linear-gradient(transparent 49.5%,#ffffff66 50%,transparent 50.5%),linear-gradient(90deg,transparent 49.5%,#ffffff66 50%,transparent 50.5%)";

    video.style.backgroundSize = "33.33% 33.33%";
};

document.getElementById("timerBtn").onclick = () => {
    const choices = [0, 3, 5, 10];

    timer = choices[(choices.indexOf(timer) + 1) % choices.length];

    document.getElementById("timerBtn").textContent =
        timer === 0 ? "⏱" : `${timer}s`;
};

function updateGallery() {
    if (!db) return;

    const transaction = db.transaction("media", "readonly");
    const store = transaction.objectStore("media");
    const request = store.getAll();

    request.onsuccess = () => {
        const items = request.result;

        document.getElementById("photoCount").textContent = items.length;

        const container = document.getElementById("galleryItems");
        container.innerHTML = "";

        items.reverse().forEach(item => {
            const url = URL.createObjectURL(item.blob);

            const div = document.createElement("div");
            div.className = "gallery-item";

            const media = document.createElement(
                item.type === "image" ? "img" : "video"
            );

            media.src = url;

            if (item.type === "video") {
                media.controls = true;
            }

            const download = document.createElement("button");
            download.textContent = "تنزيل";

            download.onclick = () => {
                const a = document.createElement("a");

                a.href = url;
                a.download =
                    `camera-${item.id}.${item.type === "image" ? "jpg" : "webm"}`;

                a.click();
            };

            const remove = document.createElement("button");
            remove.textContent = "حذف";

            remove.onclick = () => {
                if (!confirm("هل تريد حذف هذا الملف نهائياً؟")) return;

                db.transaction("media", "readwrite")
                    .objectStore("media")
                    .delete(item.id);

                updateGallery();
            };

            div.append(media, download, remove);
            container.appendChild(div);
        });
    };
}

function openGallery() {
    document.getElementById("gallery").classList.remove("hidden");
    updateGallery();
}

document.getElementById("galleryBtn").onclick = openGallery;
document.getElementById("gallerySmall").onclick = openGallery;

document.getElementById("closeGallery").onclick = () => {
    document.getElementById("gallery").classList.add("hidden");
};

if (!navigator.mediaDevices?.getUserMedia) {
    alert("المتصفح لا يدعم الكاميرا أو أن الاتصال غير آمن. استخدم HTTPS.");
}
