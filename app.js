"use strict";

// عناصر التطبيق
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
let recordedParts = [];
let photos = [];
let filterIndex = 0;
let timer = 0;
let db = null;

const filters = [
    "none",
    "grayscale(100%)",
    "sepia(100%)",
    "contrast(150%)",
    "saturate(200%)",
    "brightness(120%)",
    "hue-rotate(90deg)"
];

// رسائل التطبيق
function showMessage(text) {
    message.textContent = text;
    message.style.display = "block";
}

function hideMessage() {
    message.style.display = "none";
}

// قاعدة بيانات المعرض
const dbRequest = indexedDB.open("CameraAppDB", 1);

dbRequest.onupgradeneeded = event => {
    const database = event.target.result;

    if (!database.objectStoreNames.contains("media")) {
        database.createObjectStore("media", {
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
    alert("تعذر فتح معرض الصور.");
};

// تشغيل الكاميرا والميكروفون
async function startCamera() {

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {

        showMessage("متصفحك لا يدعم الكاميرا. استخدم اتصال HTTPS.");
        return;
    }

    try {

        startBtn.disabled = true;
        showMessage("جارٍ طلب إذن الكاميرا والميكروفون...");

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        stream = await navigator.mediaDevices.getUserMedia({

            video: {
                facingMode: {
                    ideal: facing
                },
                width: {
                    ideal: 1920
                },
                height: {
                    ideal: 1080
                }
            },

            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }

        });

        video.srcObject = stream;

        video.muted = true;
        video.playsInline = true;

        await video.play();

        hideMessage();

        startBtn.style.display = "none";

        const audioTrack = stream.getAudioTracks()[0];

        if (audioTrack) {
            console.log("الميكروفون يعمل:", audioTrack.label);
        }

    } catch (error) {

        console.error("Camera Error:", error);

        if (error.name === "NotAllowedError") {
            showMessage("لم تسمح باستخدام الكاميرا أو الميكروفون. راجع أذونات الموقع.");
        }

        else if (error.name === "NotFoundError") {
            showMessage("لم يتم العثور على كاميرا أو ميكروفون.");
        }

        else if (error.name === "NotReadableError") {
            showMessage("الكاميرا أو الميكروفون مستخدم بالفعل في تطبيق آخر.");
        }

        else if (error.name === "OverconstrainedError") {
            showMessage("تعذر تشغيل الكاميرا بالإعدادات المطلوبة.");
        }

        else {
            showMessage("حدث خطأ أثناء تشغيل الكاميرا والميكروفون.");
        }

    } finally {

        startBtn.disabled = false;

    }
}

startBtn.addEventListener("click", startCamera);

// التقاط الصور
captureBtn.addEventListener("click", async () => {

    if (!stream || video.readyState < 2) {
        alert("شغّل الكاميرا أولاً.");
        return;
    }

    captureBtn.disabled = true;

    try {

        if (timer > 0) {

            for (let i = timer; i > 0; i--) {
                showMessage("التقاط الصورة بعد " + i);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            hideMessage();
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.filter = filters[filterIndex];

        if (facing === "user") {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.filter = "none";

        canvas.toBlob(blob => {

            if (blob) {
                saveMedia(blob, "image");
                showMessage("تم التقاط الصورة بنجاح!");
                setTimeout(hideMessage, 1200);
            }

        }, "image/jpeg", 0.95);

        flash.style.opacity = "1";

        setTimeout(() => {
            flash.style.opacity = "0";
        }, 150);

    } catch (error) {

        console.error(error);
        alert("تعذر التقاط الصورة.");

    } finally {

        captureBtn.disabled = false;

    }

});

// حفظ الصور والفيديوهات
function saveMedia(blob, type) {

    if (!db) {
        alert("المعرض لم يجهز بعد.");
        return;
    }

    const transaction = db.transaction("media", "readwrite");

    transaction.objectStore("media").add({
        blob: blob,
        type: type,
        date: new Date().toISOString()
    });

    transaction.oncomplete = () => {
        updateGallery();
    };

}

// تسجيل الفيديو بالصوت والصورة
recordBtn.addEventListener("click", () => {

    if (!stream) {
        alert("شغّل الكاميرا والميكروفون أولاً.");
        return;
    }

    if (!recording) {

        if (!window.MediaRecorder) {
            alert("متصفحك لا يدعم تسجيل الفيديو.");
            return;
        }

        const audioTracks = stream.getAudioTracks();

        if (audioTracks.length === 0) {
            alert("الميكروفون غير متصل. أعد تشغيل الكاميرا.");
            return;
        }

        const supportedTypes = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm"
        ];

        let selectedType = "";

        for (const type of supportedTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                selectedType = type;
                break;
            }
        }

        try {

            const options = selectedType
                ? { mimeType: selectedType }
                : {};

            mediaRecorder = new MediaRecorder(stream, options);

            recordedParts = [];

            mediaRecorder.ondataavailable = event => {

                if (event.data && event.data.size > 0) {
                    recordedParts.push(event.data);
                }

            };

            mediaRecorder.onstop = () => {

                const blob = new Blob(recordedParts, {
                    type: mediaRecorder.mimeType || "video/webm"
                });

                saveMedia(blob, "video");

                showMessage("تم حفظ الفيديو بالصوت والصورة!");

                setTimeout(hideMessage, 2000);

            };

            mediaRecorder.onerror = event => {
                console.error("Recording Error:", event.error);
                alert("حدث خطأ أثناء تسجيل الفيديو.");
            };

            mediaRecorder.start();

            recording = true;

            recordBtn.textContent = "■";

            showMessage("جاري تسجيل الفيديو بالصوت والصورة...");

        } catch (error) {

            console.error(error);
            alert("تعذر بدء تسجيل الفيديو.");

        }

    } else {

        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }

        recording = false;

        recordBtn.textContent = "●";

    }

});

// تبديل الكاميرا الأمامية والخلفية
switchBtn.addEventListener("click", async () => {

    if (recording) {
        alert("أوقف تسجيل الفيديو أولاً.");
        return;
    }

    facing = facing === "environment"
        ? "user"
        : "environment";

    if (stream) {
        await startCamera();
    }

});

// تقريب الصورة
zoom.addEventListener("input", async () => {

    if (!stream) return;

    const track = stream.getVideoTracks()[0];

    if (!track) return;

    try {

        const capabilities = track.getCapabilities();

        if (capabilities.zoom) {

            const value = Number(zoom.value);

            await track.applyConstraints({
                advanced: [{
                    zoom: value
                }]
            });

        } else {

            video.style.transform =
                `scale(${zoom.value})`;

        }

    } catch (error) {

        console.log("Zoom:", error);

    }

});

// الفلاتر
document.getElementById("filterBtn").addEventListener("click", () => {

    filterIndex = (filterIndex + 1) % filters.length;

    video.style.filter = filters[filterIndex];

});

// شبكة التصوير
document.getElementById("gridBtn").addEventListener("click", () => {

    video.style.backgroundImage =
        video.style.backgroundImage
            ? ""
            : "linear-gradient(transparent 49.5%,#ffffff66 50%,transparent 50.5%),linear-gradient(90deg,transparent 49.5%,#ffffff66 50%,transparent 50.5%)";

    video.style.backgroundSize = "33.33% 33.33%";

});

// المؤقت
document.getElementById("timerBtn").addEventListener("click", () => {

    const choices = [0, 3, 5, 10];

    timer = choices[
        (choices.indexOf(timer) + 1) % choices.length
    ];

    document.getElementById("timerBtn").textContent =
        timer === 0 ? "⏱" : timer + "s";

});

// تحديث المعرض
function updateGallery() {

    if (!db) return;

    const transaction = db.transaction("media", "readonly");

    const store = transaction.objectStore("media");

    const request = store.getAll();

    request.onsuccess = () => {

        const items = request.result;

        document.getElementById("photoCount").textContent =
            items.length;

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
                media.playsInline = true;
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

                if (!confirm("هل تريد حذف هذا الملف نهائياً؟")) {
                    return;
                }

                const deleteTransaction =
                    db.transaction("media", "readwrite");

                deleteTransaction.objectStore("media").delete(item.id);

                deleteTransaction.oncomplete = updateGallery;

            };

            div.append(media, download, remove);

            container.appendChild(div);

        });

    };

}

// فتح المعرض
function openGallery() {

    document.getElementById("gallery").classList.remove("hidden");

    updateGallery();

}

document.getElementById("galleryBtn").addEventListener("click", openGallery);

document.getElementById("gallerySmall").addEventListener("click", openGallery);

// إغلاق المعرض
document.getElementById("closeGallery").addEventListener("click", () => {

    document.getElementById("gallery").classList.add("hidden");

});

// إيقاف الكاميرا عند مغادرة الصفحة
window.addEventListener("pagehide", () => {

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

});
