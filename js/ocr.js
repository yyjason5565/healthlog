const MAX_EDGE = 2000;

let scriptPromise = null;
let workerPromise = null;
let progressSink = () => {};

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./vendor/tesseract/tesseract.min.js";
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error("The on-device reader did not start."));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("The on-device reader could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await loadTesseract();
      const worker = await Tesseract.createWorker("eng", 1, {
        workerPath: "./vendor/tesseract/worker.min.js",
        corePath: "./vendor/tesseract",
        langPath: "./vendor/tesseract",
        workerBlobURL: false,
        gzip: true,
        cacheMethod: "write",
        logger: (message) => progressSink(message),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
        user_defined_dpi: "120",
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function imageSource(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* Fall through to an Image element. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not open that image."));
    });
    img.src = url;
    return await loaded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function snapContrast(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    gray[p] = g;
    hist[g] += 1;
  }
  const total = gray.length;
  let seen = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i += 1) {
    seen += hist[i];
    if (seen >= total * 0.02) {
      low = i;
      break;
    }
  }
  seen = 0;
  for (let i = 255; i >= 0; i -= 1) {
    seen += hist[i];
    if (seen >= total * 0.02) {
      high = i;
      break;
    }
  }
  if (high <= low + 8) {
    low = 0;
    high = 255;
  }
  const scale = 255 / (high - low);
  for (let p = 0, i = 0; p < gray.length; p += 1, i += 4) {
    let v = (gray[p] - low) * scale;
    if (v < 0) v = 0;
    if (v > 255) v = 255;
    if (v >= 232) v = 255;
    else if (v <= 28) v = 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

export async function preprocessImage(file) {
  const source = await imageSource(file);
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();
  const imageData = ctx.getImageData(0, 0, width, height);
  snapContrast(imageData);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function recognizeImage(file, onProgress) {
  progressSink = onProgress || (() => {});
  progressSink({ status: "preparing image", progress: 0.02 });
  const canvas = await preprocessImage(file);
  const worker = await getWorker();
  const result = await worker.recognize(canvas, {}, { text: true, blocks: false, hocr: false, tsv: false });
  progressSink({ status: "recognizing text", progress: 1 });
  return result?.data?.text || "";
}
