
import React, { useState, useEffect, ChangeEvent } from 'react';
import Spinner from './Spinner.tsx';
import { UploadIcon } from './IconComponents.tsx';

// --- TYPE DEFINITIONS ---
export interface SchedulerSettings {
    files: File[];
    postType: 'Image' | 'Video';
    startDate: string;
    interval: number; // in minutes
    startTime: string;
    endTime: string;
    demoCaption: string;
    captionMode: 'demo' | 'filename';
    checkInPlaceId: string;
    smartScheduleEnabled: boolean;
}

export interface SchedulingLogEntry {
    timestamp: string;
    file: string;
    status: 'success' | 'error' | 'info';
    message: string;
}


// --- HELPER COMPONENTS ---
const FormSection: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <div className={`bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700/50 ${className}`}>
        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{label}</label>
        {children}
    </div>
);


interface SchedulerTabProps {
    schedulerSettings: SchedulerSettings;
    handleSettingChange: (key: keyof SchedulerSettings, value: any) => void;
    handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
    isScheduling: boolean;
    isPaused: boolean;
    isTesting: boolean;
    handleTestUpload: () => void;
    handleSchedulingProcess: () => void;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
    schedulingProgress: { current: number; total: number };
    schedulingLog: SchedulingLogEntry[];
    logContainerRef: React.RefObject<HTMLDivElement>;
}

const SchedulerTab: React.FC<SchedulerTabProps> = ({
    schedulerSettings,
    handleSettingChange,
    handleFileSelect,
    isScheduling,
    isPaused,
    isTesting,
    handleTestUpload,
    handleSchedulingProcess,
    setIsPaused,
    schedulingProgress,
    schedulingLog,
    logContainerRef,
}) => {
    // Derived State for Summary - now managed within this component
    const [dailyPostCount, setDailyPostCount] = useState(0);
    const [estDurationDays, setEstDurationDays] = useState(0);

    // Calculate schedule summary
    useEffect(() => {
        const { startTime, endTime, interval, files, smartScheduleEnabled } = schedulerSettings;
        if (smartScheduleEnabled) {
            setDailyPostCount(0);
            setEstDurationDays(0);
            return;
        }
        if (!startTime || !endTime || !interval || interval <= 0) {
            setDailyPostCount(0);
            setEstDurationDays(0);
            return;
        }
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (endMinutes <= startMinutes) {
            setDailyPostCount(0);
            setEstDurationDays(0);
            return;
        }

        const totalMinutes = endMinutes - startMinutes;
        const postsPerDay = Math.floor(totalMinutes / interval) + 1;
        setDailyPostCount(postsPerDay);

        if (files.length > 0 && postsPerDay > 0) {
            setEstDurationDays(Math.ceil(files.length / postsPerDay));
        } else {
            setEstDurationDays(0);
        }
    }, [schedulerSettings]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <FormSection title="1. Select Content">
                    <FormRow label="Post Type">
                        <select value={schedulerSettings.postType} onChange={e => handleSettingChange('postType', e.target.value as 'Image' | 'Video')} className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary">
                            <option value="Image">Image</option>
                            <option value="Video">Video</option>
                        </select>
                    </FormRow>
                    <FormRow label="Select Folder Containing Media">
                        <label className="w-full cursor-pointer flex items-center justify-center gap-2 p-3 rounded-md bg-primary text-primary-text hover:bg-primary-hover transition-all transform hover:scale-[1.02] shadow-md">
                            <UploadIcon className="w-5 h-5" />
                            <span>Browse ({schedulerSettings.files.length})</span>
                            <input type="file" multiple onChange={handleFileSelect} className="hidden" {...{webkitdirectory: "true", directory: "true"}} />
                        </label>
                    </FormRow>
                </FormSection>

                <FormSection title="2. Define Schedule">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center justify-between">
                            <label htmlFor="smart-schedule-toggle" className="font-bold text-primary dark:text-blue-300 cursor-pointer">
                                Smart Schedule (AI-Powered)
                            </label>
                            <div className="relative">
                                <input 
                                    type="checkbox" 
                                    id="smart-schedule-toggle"
                                    checked={schedulerSettings.smartScheduleEnabled} 
                                    onChange={e => handleSettingChange('smartScheduleEnabled', e.target.checked)} 
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </div>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                            Let AI analyze your Page's engagement to find the best times to post. Disables manual time settings. Requires `read_insights` permission.
                        </p>
                    </div>
                     <div className={`space-y-4 pt-4 transition-opacity duration-300 ${schedulerSettings.smartScheduleEnabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormRow label="Start Date">
                                <input type="date" value={schedulerSettings.startDate} onChange={e => handleSettingChange('startDate', e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary" />
                            </FormRow>
                            <FormRow label="Interval (minutes)">
                                <input type="number" min="1" value={schedulerSettings.interval} onChange={e => handleSettingChange('interval', parseInt(e.target.value))} className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary" />
                            </FormRow>
                        </div>
                         <FormRow label="Time Window (daily)">
                            <div className="flex items-center gap-2">
                                <input type="time" value={schedulerSettings.startTime} onChange={e => handleSettingChange('startTime', e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary" />
                                <span className="text-gray-400">to</span>
                                <input type="time" value={schedulerSettings.endTime} onChange={e => handleSettingChange('endTime', e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary" />
                            </div>
                        </FormRow>
                    </div>
                </FormSection>

                <FormSection title="3. Configure Post Details">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <FormRow label="AI Caption Mode">
                                <div className="flex rounded-md shadow-sm">
                                    <button onClick={() => handleSettingChange('captionMode', 'demo')} className={`px-4 py-2 rounded-l-md text-sm font-medium transition-colors ${schedulerSettings.captionMode === 'demo' ? 'bg-primary text-primary-text' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>Demo Prompt</button>
                                    <button onClick={() => handleSettingChange('captionMode', 'filename')} className={`px-4 py-2 rounded-r-md text-sm font-medium transition-colors ${schedulerSettings.captionMode === 'filename' ? 'bg-primary text-primary-text' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>From Filename</button>
                                </div>
                            </FormRow>
                            <FormRow label="Demo Caption & Hashtags">
                                <textarea value={schedulerSettings.demoCaption} onChange={e => handleSettingChange('demoCaption', e.target.value)} rows={4} className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary" placeholder="Enter a sample caption for the AI..." />
                            </FormRow>
                        </div>
                        <div>
                            <FormRow label="Check-in Place ID (optional)">
                                <input 
                                    type="text" 
                                    value={schedulerSettings.checkInPlaceId} 
                                    onChange={(e) => handleSettingChange('checkInPlaceId', e.target.value)} 
                                    placeholder="Enter numeric Facebook Place ID" 
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary"
                                />
                                <a href="https://lookup-id.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary/80 hover:text-primary hover:underline mt-1 block">
                                    Find a Facebook Place ID
                                </a>
                            </FormRow>
                        </div>
                    </div>
                </FormSection>
            </div>
            <div className="lg:col-span-1 space-y-6">
                 <FormSection title="Summary & Actions">
                    {schedulerSettings.smartScheduleEnabled ? (
                        <div className="p-3 text-center bg-blue-50 dark:bg-blue-900/20 rounded-md">
                            <p className="font-bold text-primary dark:text-blue-300">Smart Schedule is Active</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400">Posts will be scheduled at optimal engagement times.</p>
                            <div className="font-medium mt-2">Total Files: <span className="font-bold text-lg text-primary">{schedulerSettings.files.length}</span></div>
                        </div>
                    ) : (
                        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                           <div className="flex justify-between items-center"><span className="font-medium">Total Files:</span> <span className="font-bold text-lg text-primary">{schedulerSettings.files.length}</span></div>
                           <div className="flex justify-between items-center"><span className="font-medium">Posts per Day:</span> <span className="font-bold text-lg text-primary">{dailyPostCount}</span></div>
                           <div className="flex justify-between items-center"><span className="font-medium">Est. Duration:</span> <span className="font-bold text-lg text-primary">{estDurationDays} days</span></div>
                        </div>
                    )}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={handleTestUpload} disabled={isScheduling || isTesting} className="w-full py-2 px-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-px">
                                {isTesting ? <Spinner /> : "Test First"}
                            </button>
                            <button onClick={() => setIsPaused(!isPaused)} disabled={!isScheduling} className={`w-full py-2 px-2 text-sm font-semibold text-white rounded-lg shadow-md disabled:opacity-50 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-px ${isPaused ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-500 hover:bg-gray-600'}`}>
                                {isPaused ? "Resume" : "Pause"}
                            </button>
                        </div>
                        <button onClick={handleSchedulingProcess} disabled={isTesting} className={`w-full py-3 px-4 text-lg font-bold text-white rounded-lg shadow-lg disabled:opacity-50 flex items-center justify-center gap-3 transition-all transform hover:-translate-y-1 hover:shadow-2xl ${isScheduling ? 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600' : 'bg-gradient-to-r from-green-500 to-teal-400 hover:from-green-600 hover:to-teal-500'}`}>
                            {isScheduling ? <><Spinner /> Stop Scheduling</> : "Start Bulk Scheduling"}
                        </button>
                    </div>
                </FormSection>
                <FormSection title="Progress">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div className="bg-gradient-to-r from-green-400 to-blue-500 h-4 rounded-full transition-all duration-500" style={{ width: `${schedulingProgress.total > 0 ? (schedulingProgress.current / schedulingProgress.total) * 100 : 0}%` }}></div>
                    </div>
                    <p className="text-center text-sm font-semibold">{schedulingProgress.current} / {schedulingProgress.total}</p>
                </FormSection>
            </div>
            <div className="lg:col-span-3">
                <FormSection title="Live Log">
                    <div ref={logContainerRef} className="h-64 bg-gray-100 dark:bg-gray-900/50 rounded-md p-3 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 flex flex-col-reverse border border-gray-200 dark:border-gray-700">
                        {schedulingLog.length === 0 && <p className="text-gray-500 text-center py-10">Log will appear here once scheduling starts.</p>}
                        {schedulingLog.map((log, index) => (
                            <div key={index} className={`flex items-start gap-3 text-sm p-1.5 rounded-md ${log.status === 'success' ? 'bg-green-50 dark:bg-green-900/30' : log.status === 'error' ? 'bg-red-50 dark:bg-red-900/30' : 'bg-gray-200/50 dark:bg-gray-800/50'}`}>
                                <span className="text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">[{log.timestamp}]</span>
                                <span className="font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{log.file && `[${log.file}]`}</span>
                                <span className={`flex-grow ${log.status === 'success' ? 'text-green-700 dark:text-green-400' : log.status === 'error' ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                                    {log.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </FormSection>
            </div>
        </div>
    );
};

export default SchedulerTab;