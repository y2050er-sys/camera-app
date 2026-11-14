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
let microphoneStream = null;
let facing = "environment";
let mediaRecorder = null;
let recording = false;
let recordedParts = [];
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

// عرض الرسائل
function showMessage(text) {
    message.textContent = text;
    message.style.display = "block";
}

function hideMessage() {
    message.style.display = "none";
}

// إيقاف الكاميرا والميكروفون
function stopStream(mediaStream) {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
}

// إنشاء قاعدة بيانات المعرض
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

// تشغيل الكاميرا فقط دون الميكروفون
async function startCamera() {

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {

        showMessage("متصفحك لا يدعم تشغيل الكاميرا. تأكد من فتح الموقع عبر HTTPS.");
        return;
    }

    if (startBtn) startBtn.disabled = true;

    try {

        showMessage("جارٍ تشغيل الكاميرا...");

        stopStream(stream);
        stream = null;

        stream = await navigator.mediaDevices.getUserMedia({

            video: {
                facingMode: { ideal: facing },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },

            audio: false

        });

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        await video.play();

        hideMessage();

        if (startBtn) {
            startBtn.style.display = "none";
        }

    } catch (error) {

        console.error("Camera Error:", error);

        if (error.name === "NotAllowedError" ||
            error.name === "SecurityError") {

            showMessage("لم يُسمح للموقع باستخدام الكاميرا. راجع أذونات الموقع أو قيود مسؤول التابلت.");

        } else if (error.name === "NotFoundError") {

            showMessage("لم يتم العثور على كاميرا متاحة على الجهاز.");

        } else if (error.name === "NotReadableError") {

            showMessage("تعذر الوصول إلى الكاميرا. قد تكون مشغولة أو محجوبة بسياسة الجهاز.");

        } else if (error.name === "OverconstrainedError") {

            showMessage("الكاميرا لا تدعم الإعدادات المطلوبة.");

        } else {

            showMessage("حدث خطأ أثناء تشغيل الكاميرا: " +
                (error.message || error.name));

        }

        stopStream(stream);
        stream = null;

    } finally {

        if (startBtn) {
            startBtn.disabled = false;
        }

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

                await new Promise(resolve =>
                    setTimeout(resolve, 1000)
                );

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

    const transaction = db.transaction(
        "media",
        "readwrite"
    );

    transaction.objectStore("media").add({

        blob: blob,
        type: type,
        date: new Date().toISOString()

    });

    transaction.oncomplete = () => {
        updateGallery();
    };

}

// تسجيل الفيديو مع طلب الميكروفون عند التسجيل فقط
recordBtn.addEventListener("click", async () => {

    if (!stream) {
        alert("شغّل الكاميرا أولاً.");
        return;
    }

    if (!recording) {

        if (!window.MediaRecorder) {
            alert("متصفحك لا يدعم تسجيل الفيديو.");
            return;
        }

        try {

            showMessage("جارٍ تجهيز الميكروفون للتسجيل...");

            microphoneStream =
                await navigator.mediaDevices.getUserMedia({

                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },

                    video: false

                });

            const combinedStream = new MediaStream([

                ...stream.getVideoTracks(),
                ...microphoneStream.getAudioTracks()

            ]);

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

            const options = selectedType
                ? { mimeType: selectedType }
                : {};

            mediaRecorder = new MediaRecorder(
                combinedStream,
                options
            );

            recordedParts = [];

            mediaRecorder.ondataavailable = event => {

                if (event.data && event.data.size > 0) {
                    recordedParts.push(event.data);
                }

            };

            mediaRecorder.onstop = () => {

                const blob = new Blob(
                    recordedParts,
                    {
                        type: mediaRecorder.mimeType || "video/webm"
                    }
                );

                saveMedia(blob, "video");

                showMessage("تم حفظ الفيديو بالصوت والصورة!");

                setTimeout(hideMessage, 2000);

                stopStream(microphoneStream);
                microphoneStream = null;

            };

            mediaRecorder.onerror = event => {

                console.error("Recording Error:", event.error);

                showMessage("حدث خطأ أثناء تسجيل الفيديو.");

                stopStream(microphoneStream);
                microphoneStream = null;

                recording = false;
                recordBtn.textContent = "●";

            };

            mediaRecorder.start();

            recording = true;

            recordBtn.textContent = "■";

            showMessage("جاري تسجيل الفيديو بالصوت والصورة...");

        } catch (error) {

            console.error("Microphone/Recording Error:", error);

            stopStream(microphoneStream);
            microphoneStream = null;

            if (error.name === "NotAllowedError" ||
                error.name === "SecurityError") {

                showMessage("لم يُسمح باستخدام الميكروفون. راجع أذونات الموقع أو قيود مسؤول التابلت.");

            } else if (error.name === "NotFoundError") {

                showMessage("لم يتم العثور على ميكروفون متاح.");

            } else if (error.name === "NotReadableError") {

                showMessage("تعذر الوصول إلى الميكروفون.");

            } else {

                showMessage("تعذر بدء التسجيل: " +
                    (error.message || error.name));

            }

        }

    } else {

        if (mediaRecorder &&
            mediaRecorder.state !== "inactive") {

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

                advanced: [
                    { zoom: value }
                ]

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

    const transaction = db.transaction(
        "media",
        "readonly"
    );

    const store = transaction.objectStore("media");

    const request = store.getAll();

    request.onsuccess = () => {

        const items = request.result;

        document.getElementById("photoCount").textContent =
            items.length;

        const container =
            document.getElementById("galleryItems");

        container.innerHTML = "";

        items.reverse().forEach(item => {

            const url = URL.createObjectURL(item.blob);

            const div = document.createElement("div");

            div.className = "gallery-item";

            const media = document.createElement(
                item.type === "image"
                    ? "img"
                    : "video"
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

                deleteTransaction
                    .objectStore("media")
                    .delete(item.id);

                deleteTransaction.oncomplete = updateGallery;

            };

            div.append(media, download, remove);

            container.appendChild(div);

        });

    };

}

// فتح المعرض
function openGallery() {

    document.getElementById("gallery")
        .classList.remove("hidden");

    updateGallery();

}

document.getElementById("galleryBtn")
    .addEventListener("click", openGallery);

document.getElementById("gallerySmall")
    .addEventListener("click", openGallery);

// إغلاق المعرض
document.getElementById("closeGallery")
    .addEventListener("click", () => {

        document.getElementById("gallery")
            .classList.add("hidden");

    });

// إيقاف الكاميرا والميكروفون عند مغادرة الصفحة
window.addEventListener("pagehide", () => {

    stopStream(stream);
    stopStream(microphoneStream);

    stream = null;
    microphoneStream = null;

});
