
import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/';
const FINAL_SQUARE_SIZE = 1080;
let modelsLoaded = false;

export interface CollageSettings {
    faceZoomEnabled: boolean;
    borderSize: number;
    borderColor: string;
    gapSize: number;
    gapColor: string;
    useEmojiA: boolean;
    useEmojiB: boolean;
    emojiSizePercent: number;
    useWatermark: boolean;
    watermarkText: string;
    outlineEnabled: boolean;
    outlineColor: string;
    outlineThickness: number;
    overlayEnabled: boolean;
    overlayColor: string;
    overlayAlpha: number;
    gradientEnabled: boolean;
    gradientColor1: string;
    gradientColor2: string;
    gradientHeightPercent: number;
    useNameA: boolean;
    nameTextA: string;
    useNameB: boolean;
    nameTextB: string;
    nameTextColor: string;
    nameTextSizePercent: number;
    nameFont: string;
}

export async function loadModels() {
    if (modelsLoaded) return;
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
    } catch (error) {
        console.error("Error loading face-api models:", error);
        throw new Error("Failed to load AI models for face detection.");
    }
}

async function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = URL.createObjectURL(file);
    });
}

function hexToRgba(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function smartCropAndResize(img: HTMLImageElement, targetW: number, targetH: number, settings: CollageSettings): Promise<HTMLCanvasElement | null> {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (!modelsLoaded || !settings.faceZoomEnabled) {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        return canvas;
    }

    const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true);
    const validFaces = detections.filter(d => d.landmarks.getLeftEye().length > 0 && d.landmarks.getRightEye().length > 0);

    if (validFaces.length === 0) {
        return null; // No valid face found
    }

    const mainFace = validFaces.sort((a, b) => b.detection.box.area - a.detection.box.area)[0];

    const { box } = mainFace.detection;
    const leftEye = mainFace.landmarks.getLeftEye();
    const rightEye = mainFace.landmarks.getRightEye();
    const fx = box.x, fy = box.y, fw = box.width, fh = box.height;
    const img_w = img.naturalWidth, img_h = img.naturalHeight;

    const faceHeightRatio = fh / img_h;
    const CLOSEUP_THRESHOLD = 0.35;
    
    const eyesCenterX = (leftEye[0].x + rightEye[0].x) / 2;
    const eyesCenterY = (leftEye[0].y + rightEye[0].y) / 2;
    const faceCenterY = fy + fh / 2;
    
    const targetAspect = targetW / targetH;

    let cropX, cropY, cropW, cropH;

    if (faceHeightRatio >= CLOSEUP_THRESHOLD) { // Close-up
        const sourceAspect = img_w / img_h;
        if (sourceAspect > targetAspect) { // Image is wider than target
            cropH = img_h;
            cropW = cropH * targetAspect;
        } else { // Image is taller than target
            cropW = img_w;
            cropH = cropW / targetAspect;
        }
        cropX = eyesCenterX - (cropW / 2);
        cropY = faceCenterY - (cropH / 2);
    } else { // Wider shot
        cropH = fh * 3.5;
        cropW = cropH * targetAspect;
        cropX = eyesCenterX - (cropW / 2);
        cropY = eyesCenterY - (cropH / 3); // "Rule of thirds" for eyes
    }
    
    // Ensure crop box is within image bounds
    cropX = Math.max(0, Math.min(cropX, img_w - cropW));
    cropY = Math.max(0, Math.min(cropY, img_h - cropH));

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
    return canvas;
}

export async function createCollageImage(
    fileA: File,
    fileB: File,
    settings: CollageSettings,
    emojiFileA: File | null,
    emojiFileB: File | null,
    theme: 'light' | 'dark'
): Promise<Blob | null> {
    const [imgA, imgB] = await Promise.all([loadImage(fileA), loadImage(fileB)]);
    
    const { borderSize, gapSize } = settings;
    const contentWidth = FINAL_SQUARE_SIZE - (2 * borderSize) - gapSize;
    const halfWidth = Math.floor(contentWidth / 2);
    const contentHeight = FINAL_SQUARE_SIZE - (2 * borderSize);

    const [resizedA, resizedB] = await Promise.all([
        smartCropAndResize(imgA, halfWidth, contentHeight, settings),
        smartCropAndResize(imgB, halfWidth, contentHeight, settings)
    ]);
    
    if (!resizedA || !resizedB) return null;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = FINAL_SQUARE_SIZE;
    finalCanvas.height = FINAL_SQUARE_SIZE;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return null;

    // Backgrounds
    ctx.fillStyle = settings.borderColor;
    ctx.fillRect(0, 0, FINAL_SQUARE_SIZE, FINAL_SQUARE_SIZE);
    if (gapSize > 0) {
        ctx.fillStyle = settings.gapColor;
        ctx.fillRect(borderSize, borderSize, contentWidth, contentHeight);
    }

    // Main images
    ctx.drawImage(resizedA, borderSize, borderSize);
    ctx.drawImage(resizedB, borderSize + halfWidth + gapSize, borderSize);
    
    // --- Effects ---
    await applyAllEffects(finalCanvas, settings, emojiFileA, emojiFileB, theme);

    return new Promise(resolve => finalCanvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.95));
}

async function applyAllEffects(
    canvas: HTMLCanvasElement, 
    settings: CollageSettings,
    emojiFileA: File | null,
    emojiFileB: File | null,
    theme: 'light' | 'dark'
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (settings.gradientEnabled) applyGradient(ctx, settings);
    if (settings.overlayEnabled) applyColorOverlay(ctx, settings);
    if (settings.outlineEnabled && modelsLoaded) await applyFaceOutline(canvas, settings);
    applyNameText(ctx, settings);
    if (settings.useEmojiA && emojiFileA) await pasteEmoji(ctx, emojiFileA, 0, settings);
    if (settings.useEmojiB && emojiFileB) await pasteEmoji(ctx, emojiFileB, 1, settings);
    if (settings.useWatermark && settings.watermarkText) applyWatermark(ctx, settings, theme);
}

function applyNameText(ctx: CanvasRenderingContext2D, settings: CollageSettings) {
    const { 
        borderSize, gapSize, useNameA, nameTextA, useNameB, nameTextB,
        nameTextColor, nameTextSizePercent, nameFont
    } = settings;

    if (!useNameA && !useNameB) return;

    const canvas = ctx.canvas;
    const contentWidth = FINAL_SQUARE_SIZE - (2 * borderSize) - gapSize;
    const halfWidth = Math.floor(contentWidth / 2);

    const fontSize = Math.floor(halfWidth * (nameTextSizePercent / 100));
    ctx.font = `bold ${fontSize}px ${nameFont || 'Teko, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    const y = canvas.height - borderSize - 15;

    // Shadow for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';

    if (useNameA && nameTextA) {
        const xA = borderSize + (halfWidth / 2);
        ctx.fillText(nameTextA, xA + 2, y + 2); // Shadow offset
    }

    if (useNameB && nameTextB) {
        const xB = borderSize + halfWidth + gapSize + (halfWidth / 2);
        ctx.fillText(nameTextB, xB + 2, y + 2); // Shadow offset
    }
    
    // Main Text
    ctx.fillStyle = nameTextColor;

    if (useNameA && nameTextA) {
        const xA = borderSize + (halfWidth / 2);
        ctx.fillText(nameTextA, xA, y);
    }

    if (useNameB && nameTextB) {
        const xB = borderSize + halfWidth + gapSize + (halfWidth / 2);
        ctx.fillText(nameTextB, xB, y);
    }
}


function applyWatermark(ctx: CanvasRenderingContext2D, settings: CollageSettings, theme: 'light' | 'dark') {
    const canvas = ctx.canvas;
    const fontSize = Math.floor(FINAL_SQUARE_SIZE / 40);
    ctx.font = `bold ${fontSize}px Khand`;
    
    // Use the app's theme to determine a contrasting color for the watermark.
    // This is an approximation, as the image background itself can vary.
    // A white watermark for dark theme, a black watermark for light theme.
    const isDarkTheme = theme === 'dark';
    ctx.fillStyle = isDarkTheme ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const x = canvas.width - settings.borderSize - 10;
    const y = settings.borderSize + 10;
    
    // Add a subtle shadow for better visibility on any background
    ctx.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(settings.watermarkText, x - 1, y + 1);
    
    // Draw main text
    ctx.fillStyle = isDarkTheme ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(settings.watermarkText, x, y);
}

async function applyFaceOutline(canvas: HTMLCanvasElement, settings: CollageSettings) {
    const ctx = canvas.getContext('2d');
    if(!ctx) return;
    const detections = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true);
    ctx.strokeStyle = settings.outlineColor;
    ctx.lineWidth = settings.outlineThickness;
    detections.forEach(detection => {
        const { x, y, width, height } = detection.detection.box;
        ctx.strokeRect(x, y, width, height);
    });
}

function applyGradient(ctx: CanvasRenderingContext2D, settings: CollageSettings) {
    const canvas = ctx.canvas;
    const gradH = Math.floor(canvas.height * (settings.gradientHeightPercent / 100));
    const gradient = ctx.createLinearGradient(0, canvas.height - gradH, 0, canvas.height);
    gradient.addColorStop(0, hexToRgba(settings.gradientColor1, 0));
    gradient.addColorStop(1, hexToRgba(settings.gradientColor2, 1));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, canvas.height - gradH, canvas.width, gradH);
}

function applyColorOverlay(ctx: CanvasRenderingContext2D, settings: CollageSettings) {
    ctx.fillStyle = hexToRgba(settings.overlayColor, settings.overlayAlpha / 255);
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

async function pasteEmoji(
    ctx: CanvasRenderingContext2D, 
    emojiFile: File,
    side: 0 | 1, // 0 for left, 1 for right
    settings: CollageSettings
) {
    const emojiImg = await loadImage(emojiFile);
    const canvas = ctx.canvas;
    const { borderSize, gapSize, emojiSizePercent } = settings;
    
    const halfWidth = Math.floor((FINAL_SQUARE_SIZE - (2 * borderSize) - gapSize) / 2);
    const emojiTargetWidth = Math.floor(halfWidth * (emojiSizePercent / 100));
    
    let emojiW = emojiTargetWidth;
    let emojiH = (emojiImg.height / emojiImg.width) * emojiW;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = emojiW;
    tempCanvas.height = emojiH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx?.drawImage(emojiImg, 0, 0, emojiW, emojiH);

    const xOffset = side === 0 ? borderSize : borderSize + halfWidth + gapSize;
    const x = xOffset + (halfWidth / 2) - (emojiW / 2);
    const y = canvas.height - emojiH - borderSize - Math.floor(FINAL_SQUARE_SIZE * 0.05);
    
    ctx.drawImage(tempCanvas, x, y);
}
