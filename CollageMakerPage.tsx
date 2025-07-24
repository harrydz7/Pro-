
import React, { useState, useEffect, useCallback, useMemo, ChangeEvent } from 'react';
import { useSidebar } from './src/contexts/SidebarContext.tsx';
import { useTheme } from './components/Layout.tsx';
import * as collageService from './services/collageService.ts';
import { CollageSettings } from './services/collageService.ts';
import Spinner from './components/Spinner.tsx';
import { GenerateIcon, DownloadAllIcon, SunIcon, MoonIcon, PaletteIcon, UploadIcon, ChevronUpIcon, ChevronDownIcon, CollageIcon } from './components/IconComponents.tsx';
import JSZip from 'jszip';
import { useNotification } from './src/contexts/NotificationContext.tsx';
import { HeadlineFontOptions } from './types.ts';


// --- Helper Components ---

const AccordionSection = ({ title, defaultOpen = false, children }: { title: string, defaultOpen?: boolean, children: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 text-left font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span>{title}</span>
                {isOpen ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
            </button>
            {isOpen && <div className="p-4 bg-gray-50 dark:bg-gray-800 space-y-4">{children}</div>}
        </div>
    );
};

const FormRow = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="grid grid-cols-12 gap-2 items-center">
        <label className="col-span-5 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <div className="col-span-7">{children}</div>
    </div>
);

const Slider = ({ value, onChange, min, max, step = 1 }: { value: number, onChange: (val: number) => void, min: number, max: number, step?: number }) => (
    <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full" />
        <span className="text-xs w-8 text-right">{value}</span>
    </div>
);

// Using <label> for better reliability and accessibility
const FileInputButton = ({ label, onFileSelect, fileCount, isDirectory = true }: { label: string, onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void, fileCount: number, isDirectory?: boolean }) => {
    const uniqueId = React.useId();
    
    // Custom props type to satisfy TypeScript for non-standard attributes
    const inputProps: React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & { webkitdirectory?: string, directory?: string } = {
        type: 'file',
        id: uniqueId,
        onChange: onFileSelect,
        className: 'hidden',
        multiple: isDirectory,
    };

    if (isDirectory) {
        inputProps.webkitdirectory = "true";
        inputProps.directory = "true";
    } else {
        inputProps.accept = "image/png,image/jpeg";
    }
    
    return (
        <div>
            <label htmlFor={uniqueId} className="w-full cursor-pointer flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-all transform hover:scale-105 shadow-md hover:shadow-lg">
                <UploadIcon className="w-5 h-5" />
                <span>{label} ({fileCount})</span>
            </label>
            <input {...inputProps} />
        </div>
    );
};


const CollageMakerPage: React.FC = () => {
    const { setSidebarControls } = useSidebar();
    const { theme: globalTheme, toggleTheme: toggleGlobalTheme } = useTheme();
    const { addNotification } = useNotification();

    // State for files and processing
    const [filesA, setFilesA] = useState<File[]>([]);
    const [filesB, setFilesB] = useState<File[]>([]);
    const [emojiFileA, setEmojiFileA] = useState<File | null>(null);
    const [emojiFileB, setEmojiFileB] = useState<File | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('Select folders to begin.');
    const [progress, setProgress] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isModelsLoading, setIsModelsLoading] = useState(true);

    // State for all collage settings
    const [settings, setSettings] = useState<CollageSettings>({
        faceZoomEnabled: true,
        borderSize: 5,
        borderColor: '#FFFFFF',
        gapSize: 10,
        gapColor: '#FFFFFF',
        useEmojiA: false,
        useEmojiB: false,
        emojiSizePercent: 12,
        useWatermark: false,
        watermarkText: 'YourWatermark',
        outlineEnabled: false,
        outlineColor: '#FFFF00',
        outlineThickness: 4,
        overlayEnabled: false,
        overlayColor: '#0000FF',
        overlayAlpha: 40,
        gradientEnabled: false,
        gradientColor1: '#000000',
        gradientColor2: '#FFFFFF',
        gradientHeightPercent: 30,
        useNameA: false,
        nameTextA: 'Your Name',
        useNameB: false,
        nameTextB: 'Their Name',
        nameTextColor: '#FFFFFF',
        nameTextSizePercent: 10,
        nameFont: 'Teko, sans-serif',
    });

    const handleSettingChange = useCallback(<K extends keyof CollageSettings>(key: K, value: CollageSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    // Load AI Models
    useEffect(() => {
        setStatusMessage('Loading AI face models...');
        collageService.loadModels()
            .then(() => {
                setIsModelsLoading(false);
                setStatusMessage('Ready. Select folders to begin.');
                addNotification('AI Models loaded successfully.', 'success');
            })
            .catch(err => {
                console.error("Model loading failed:", err);
                setStatusMessage('Error: Could not load AI models. Face detection disabled.');
                addNotification('Error: Could not load AI models. Face detection disabled.', 'error');
                setIsModelsLoading(false);
                // Optionally disable face-dependent features
                handleSettingChange('faceZoomEnabled', false);
                handleSettingChange('outlineEnabled', false);
            });
    }, [handleSettingChange, addNotification]);

    const handleFilesASelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const imageFiles = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
            setFilesA(imageFiles);
            addNotification(`${imageFiles.length} files selected for Folder A.`, 'info');
        }
    }, [addNotification]);

    const handleFilesBSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const imageFiles = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
            setFilesB(imageFiles);
            addNotification(`${imageFiles.length} files selected for Folder B.`, 'info');
        }
    }, [addNotification]);
    
    const handleEmojiASelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
         if (e.target.files && e.target.files.length > 0) {
            setEmojiFileA(e.target.files[0]);
        }
    }, []);

    const handleEmojiBSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
         if (e.target.files && e.target.files.length > 0) {
            setEmojiFileB(e.target.files[0]);
        }
    }, []);


    const generatePreview = useCallback(async () => {
        if (filesA.length === 0 || filesB.length === 0) {
            addNotification("Please select images for both Folder A and Folder B.", 'error');
            return;
        }
        setIsProcessing(true);
        addNotification('Generating preview...', 'info');
        setProgress(50);
        try {
            const collageBlob = await collageService.createCollageImage(filesA[0], filesB[0], settings, emojiFileA, emojiFileB, globalTheme as 'light' | 'dark');
            if (previewImage) {
                URL.revokeObjectURL(previewImage); // Clean up previous blob URL
            }
            if (collageBlob) {
                setPreviewImage(URL.createObjectURL(collageBlob));
                addNotification('Preview ready.', 'success');
                setStatusMessage('Preview ready.');
            } else {
                setPreviewImage(null);
                addNotification('Could not generate preview. No face found in one of the first images.', 'info');
                setStatusMessage('Could not generate preview. No face found in one of the first images.');
            }
        } catch (error) {
            console.error("Preview generation failed:", error);
            const errorMessage = `Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            addNotification(errorMessage, 'error');
            setStatusMessage(errorMessage);
            setPreviewImage(null);
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    }, [filesA, filesB, settings, emojiFileA, emojiFileB, previewImage, addNotification, globalTheme]);
    
     useEffect(() => {
        const canPreview = filesA.length > 0 && filesB.length > 0;
        if(canPreview) {
             generatePreview();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings, emojiFileA, emojiFileB]); // Auto-update preview on setting change

    const startBulkProcess = useCallback(async () => {
        if (filesA.length === 0 || filesB.length === 0) {
            addNotification("Cannot process. Please select both Folder A and Folder B.", 'error');
            return;
        }
        setIsProcessing(true);
        addNotification('Starting bulk process...', 'info');
        const zip = new JSZip();
        const numImages = Math.min(filesA.length, filesB.length);
        let skippedCount = 0;

        for (let i = 0; i < numImages; i++) {
            setStatusMessage(`Processing pair ${i + 1} of ${numImages}...`);
            setProgress(((i + 1) / numImages) * 100);
            try {
                const collageBlob = await collageService.createCollageImage(filesA[i], filesB[i], settings, emojiFileA, emojiFileB, globalTheme as 'light' | 'dark');
                if (collageBlob) {
                    zip.file(`collage_${i + 1}.jpg`, collageBlob);
                } else {
                    skippedCount++;
                }
            } catch (err) {
                console.error(`Error processing pair ${i + 1}:`, err);
                skippedCount++;
            }
        }

        setStatusMessage(`Zipping ${numImages - skippedCount} collages...`);
        addNotification(`Zipping ${numImages - skippedCount} collages...`, 'info');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = 'collages.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        const finalMessage = `Process complete! ${numImages - skippedCount} collages saved, ${skippedCount} skipped.`;
        addNotification(finalMessage, 'success');
        setStatusMessage(finalMessage);
        setIsProcessing(false);
        setProgress(0);
    }, [filesA, filesB, settings, emojiFileA, emojiFileB, addNotification, globalTheme]);

    const sidebarContent = useMemo(() => {
        return (
            <div>
                <AccordionSection title="Folders & Actions" defaultOpen={true}>
                    <div className="space-y-3">
                        <FileInputButton label="Folder A" onFileSelect={handleFilesASelect} fileCount={filesA.length} />
                        <FileInputButton label="Folder B" onFileSelect={handleFilesBSelect} fileCount={filesB.length} />
                        <button onClick={generatePreview} disabled={isProcessing || isModelsLoading || filesA.length === 0 || filesB.length === 0} className="w-full p-2 bg-primary text-primary-text font-semibold rounded-md hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-px">
                            <GenerateIcon /> Preview First Pair
                        </button>
                        <button onClick={startBulkProcess} disabled={isProcessing || isModelsLoading || filesA.length === 0 || filesB.length === 0} className="w-full p-2 bg-gradient-to-r from-green-500 to-teal-500 text-white font-semibold rounded-md hover:from-green-600 hover:to-teal-600 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-px">
                            <DownloadAllIcon /> Process & Download All
                        </button>
                    </div>
                </AccordionSection>

                <AccordionSection title="Style & Borders">
                    <FormRow label="Center Gap"><Slider value={settings.gapSize} onChange={v => handleSettingChange('gapSize', v)} min={0} max={50} /></FormRow>
                    <FormRow label="Gap Color"><input type="color" value={settings.gapColor} onChange={e => handleSettingChange('gapColor', e.target.value)} className="w-full p-0 h-8 border-none rounded cursor-pointer" /></FormRow>
                    <FormRow label="Outer Border"><Slider value={settings.borderSize} onChange={v => handleSettingChange('borderSize', v)} min={0} max={50} /></FormRow>
                    <FormRow label="Border Color"><input type="color" value={settings.borderColor} onChange={e => handleSettingChange('borderColor', e.target.value)} className="w-full p-0 h-8 border-none rounded cursor-pointer" /></FormRow>
                </AccordionSection>

                <AccordionSection title="Add-ons">
                    <div>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.useEmojiA} onChange={e => handleSettingChange('useEmojiA', e.target.checked)} className="rounded text-primary focus:ring-primary" /> Use Emoji/Logo A</label>
                        {settings.useEmojiA && <div className="mt-2"><FileInputButton label="Select Image A" onFileSelect={handleEmojiASelect} fileCount={emojiFileA ? 1 : 0} isDirectory={false} /></div>}
                    </div>
                    <div>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.useEmojiB} onChange={e => handleSettingChange('useEmojiB', e.target.checked)} className="rounded text-primary focus:ring-primary" /> Use Emoji/Logo B</label>
                        {settings.useEmojiB && <div className="mt-2"><FileInputButton label="Select Image B" onFileSelect={handleEmojiBSelect} fileCount={emojiFileB ? 1 : 0} isDirectory={false}/></div>}
                    </div>
                    <FormRow label="Emoji Size %"><Slider value={settings.emojiSizePercent} onChange={v => handleSettingChange('emojiSizePercent', v)} min={5} max={50} /></FormRow>
                    <hr className="my-2 border-gray-300 dark:border-gray-600" />
                    <label className="flex items-center gap-2"><input type="checkbox" checked={settings.useWatermark} onChange={e => handleSettingChange('useWatermark', e.target.checked)} className="rounded text-primary focus:ring-primary" /> Use Watermark</label>
                    {settings.useWatermark && <input type="text" value={settings.watermarkText} onChange={e => handleSettingChange('watermarkText', e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary" />}
                </AccordionSection>

                <AccordionSection title="Text Labels">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={settings.useNameA} onChange={e => handleSettingChange('useNameA', e.target.checked)} className="rounded text-primary focus:ring-primary" /> Use Text Label A</label>
                    {settings.useNameA && <input type="text" value={settings.nameTextA} onChange={e => handleSettingChange('nameTextA', e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary" />}
                    
                    <div className="mt-2">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.useNameB} onChange={e => handleSettingChange('useNameB', e.target.checked)} className="rounded text-primary focus:ring-primary" /> Use Text Label B</label>
                        {settings.useNameB && <input type="text" value={settings.nameTextB} onChange={e => handleSettingChange('nameTextB', e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary" />}
                    </div>
                    
                    <hr className="my-3 border-gray-300 dark:border-gray-600" />
                    
                    <FormRow label="Font">
                        <select value={settings.nameFont} onChange={e => handleSettingChange('nameFont', e.target.value)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                            {Object.entries(HeadlineFontOptions).map(([val, name]) => <option key={val} value={val} style={{fontFamily: val}}>{name}</option>)}
                        </select>
                    </FormRow>
                    <FormRow label="Text Size %"><Slider value={settings.nameTextSizePercent} onChange={v => handleSettingChange('nameTextSizePercent', v)} min={5} max={30} /></FormRow>
                    <FormRow label="Text Color"><input type="color" value={settings.nameTextColor} onChange={e => handleSettingChange('nameTextColor', e.target.value)} className="w-full p-0 h-8 border-none rounded cursor-pointer" /></FormRow>
                </AccordionSection>


                <AccordionSection title="Advanced Effects">
                     <label className="flex items-center gap-2"><input type="checkbox" checked={settings.faceZoomEnabled} onChange={e => handleSettingChange('faceZoomEnabled', e.target.checked)} disabled={isModelsLoading} className="rounded text-primary focus:ring-primary disabled:opacity-50" /> Auto-Zoom Face</label>
                     <hr className="my-2 border-gray-300 dark:border-gray-600" />
                     <label className="flex items-center gap-2"><input type="checkbox" checked={settings.outlineEnabled} onChange={e => handleSettingChange('outlineEnabled', e.target.checked)} disabled={isModelsLoading} className="rounded text-primary focus:ring-primary disabled:opacity-50"/> Face Outline</label>
                     {settings.outlineEnabled && <>
                        <FormRow label="Thickness"><Slider value={settings.outlineThickness} onChange={v => handleSettingChange('outlineThickness', v)} min={1} max={20} /></FormRow>
                        <FormRow label="Color"><input type="color" value={settings.outlineColor} onChange={e => handleSettingChange('outlineColor', e.target.value)} className="w-full p-0 h-8 border-none rounded cursor-pointer" /></FormRow>
                     </>}
                     <hr className="my-2 border-gray-300 dark:border-gray-600" />
                     <label className="flex items-center gap-2"><input type="checkbox" checked={settings.overlayEnabled} onChange={e => handleSettingChange('overlayEnabled', e.target.checked)} className="rounded text-primary focus:ring-primary" /> Color Overlay</label>
                     {settings.overlayEnabled && <>
                        <FormRow label="Opacity"><Slider value={settings.overlayAlpha} onChange={v => handleSettingChange('overlayAlpha', v)} min={0} max={255} /></FormRow>
                        <FormRow label="Color"><input type="color" value={settings.overlayColor} onChange={e => handleSettingChange('overlayColor', e.target.value)} className="w-full p-0 h-8 border-none rounded cursor-pointer" /></FormRow>
                     </>}
                      <hr className="my-2 border-gray-300 dark:border-gray-600" />
                     <label className="flex items-center gap-2"><input type="checkbox" checked={settings.gradientEnabled} onChange={e => handleSettingChange('gradientEnabled', e.target.checked)} className="rounded text-primary focus:ring-primary" /> Gradient Overlay</label>
                     {settings.gradientEnabled && <>
                        <FormRow label="Height %"><Slider value={settings.gradientHeightPercent} onChange={v => handleSettingChange('gradientHeightPercent', v)} min={10} max={100} /></FormRow>
                        <FormRow label="Color 1"><input type="color" value={settings.gradientColor1} onChange={e => handleSettingChange('gradientColor1', e.target.value)} className="w-full p-0 h-8 border-none rounded cursor-pointer" /></FormRow>
                        <FormRow label="Color 2"><input type="color" value={settings.gradientColor2} onChange={e => handleSettingChange('gradientColor2', e.target.value)} className="w-full p-0 h-8 border-none rounded cursor-pointer" /></FormRow>
                     </>}
                </AccordionSection>
            </div>
        );
    }, [
        settings, filesA.length, filesB.length, emojiFileA, emojiFileB, 
        isProcessing, isModelsLoading, generatePreview, startBulkProcess, 
        handleSettingChange, handleFilesASelect, handleFilesBSelect, handleEmojiASelect, handleEmojiBSelect
    ]);

    useEffect(() => {
        setSidebarControls(sidebarContent);
        // Clean up sidebar controls when this page unmounts
        return () => {
            setSidebarControls(null);
        };
    }, [sidebarContent, setSidebarControls]);


    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Intelligent Collage Maker</h1>
                <div className="flex items-center gap-4">
                    <button onClick={toggleGlobalTheme} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                        {globalTheme === 'light' ? <MoonIcon/> : <SunIcon/>}
                    </button>
                    <button className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" disabled>
                        <PaletteIcon />
                    </button>
                </div>
            </div>

            <div className="relative bg-white dark:bg-gray-800 shadow-xl rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                 <div className="flex flex-col items-center justify-center aspect-square w-full max-w-2xl mx-auto bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                    {previewImage ? (
                        <img src={previewImage} alt="Collage Preview" className="max-w-full max-h-full object-contain rounded-md" />
                    ) : (
                        <div className="text-center text-gray-500 dark:text-gray-400 p-8">
                             {isProcessing || isModelsLoading ? <Spinner size="lg" /> : <CollageIcon className="w-24 h-24 mx-auto text-gray-300 dark:text-gray-600" />}
                            <p className="mt-4">{statusMessage}</p>
                        </div>
                    )}
                </div>

                {isProcessing && (
                     <div className="absolute bottom-4 left-4 right-4 px-2">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p className="text-center text-sm mt-2">{statusMessage}</p>
                    </div>
                )}
            </div>
        </>
    );
};

export default CollageMakerPage;