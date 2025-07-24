
import React, { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
import Spinner from './components/Spinner.tsx';
import * as geminiService from './services/geminiService.ts';
import { useNotification } from './src/contexts/NotificationContext.tsx';
import SchedulerTab from './components/SchedulerTab.tsx';
import { FBPage } from './types.ts';

// --- CONSTANTS ---
const ACCESS_TOKEN_KEY = 'fbUploader_accessToken_v2';
const PAGES_KEY = 'fbUploader_pages_v2';
const API_VERSION = 'v19.0';

// --- TYPE DEFINITIONS ---
interface SchedulerSettings {
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

interface SchedulingLogEntry {
    timestamp: string;
    file: string;
    status: 'success' | 'error' | 'info';
    message: string;
}

// --- HELPER COMPONENTS ---
const FacebookIcon: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.323-1.325z"/>
    </svg>
);


// --- MAIN COMPONENT ---
const UploaderPage: React.FC = () => {
    const { addNotification } = useNotification();
    
    // Authentication State
    const [accessToken, setAccessToken] = useState<string>(() => localStorage.getItem(ACCESS_TOKEN_KEY) || '');
    const [pages, setPages] = useState<FBPage[]>(() => {
        try {
            const savedPages = localStorage.getItem(PAGES_KEY);
            return savedPages ? JSON.parse(savedPages) : [];
        } catch {
            return [];
        }
    });
    const [activePage, setActivePage] = useState<FBPage | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    // Scheduler State
    const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings>({
        files: [],
        postType: 'Image',
        startDate: new Date().toISOString().split('T')[0],
        interval: 60,
        startTime: '09:00',
        endTime: '22:00',
        demoCaption: 'Check out this amazing picture! #awesome #picoftheday',
        captionMode: 'demo',
        checkInPlaceId: '',
        smartScheduleEnabled: false,
    });
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
    const [isTesting, setIsTesting] = useState(false);
    const [schedulingProgress, setSchedulingProgress] = useState({ current: 0, total: 0 });
    const [schedulingLog, setSchedulingLog] = useState<SchedulingLogEntry[]>([]);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const schedulerCancelToken = useRef({ cancelled: false });

    const addLog = useCallback((entry: Omit<SchedulingLogEntry, 'timestamp'>) => {
        const timestamp = new Date().toLocaleTimeString();
        setSchedulingLog(prev => [{ ...entry, timestamp }, ...prev]);
    }, []);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Scroll log to bottom
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = 0;
        }
    }, [schedulingLog]);

    // Logout
    const handleLogout = useCallback(() => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(PAGES_KEY);
        setAccessToken('');
        setPages([]);
        setActivePage(null);
        setLoginError(null);
        addNotification('You have been logged out.', 'info');
    }, [addNotification]);

    // API: Fetch Pages
    const handleFetchPages = useCallback(async () => {
        if (!accessToken) {
            addNotification('Please enter a User Access Token.', 'error');
            return;
        }
        setIsLoading(true);
        setLoginError(null);
        try {
            const response = await fetch(`https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            const fetchedPages = data.data || [];
            setPages(fetchedPages);
            localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
            localStorage.setItem(PAGES_KEY, JSON.stringify(fetchedPages));
            if (fetchedPages.length > 0) {
                setActivePage(fetchedPages[0]);
                addNotification('Successfully connected to Facebook!', 'success');
            } else {
                setLoginError("No pages found for this access token.");
                addNotification("No pages found for this access token.", 'error');
            }
        } catch (e: any) {
            const message = (e.message || '').toLowerCase();
            if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                 setLoginError(`Facebook connection failed: ${e.message}. The token might be invalid or expired. Please provide a new one.`);
                 handleLogout();
            } else {
                 const errorMessage = `Failed to fetch pages: ${e.message}. Please check your token and permissions.`;
                 setLoginError(errorMessage);
                 addNotification(errorMessage, 'error');
                 handleLogout();
            }
        } finally {
            setIsLoading(false);
        }
    }, [accessToken, handleLogout, addNotification]);
    
    // Auto-fetch pages if token exists but pages don't
    useEffect(() => {
        if (accessToken && pages.length === 0) {
            handleFetchPages();
        } else if (pages.length > 0 && !activePage) {
            setActivePage(pages[0]);
        }
    }, [accessToken, pages, activePage, handleFetchPages]);
    
    const handleSettingChange = (key: keyof SchedulerSettings, value: any) => {
        setSchedulerSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            handleSettingChange('files', selectedFiles);
            addLog({ file: '', status: 'info', message: `${selectedFiles.length} files selected.` });
        }
    }, [addLog]);

    const uploadPost = useCallback(async (file: File, scheduleTime: Date | null) => {
        if (!activePage) throw new Error("No active page selected.");

        addLog({ file: file.name, status: 'info', message: 'Generating AI caption...' });
        const sourceText = schedulerSettings.captionMode === 'demo' ? schedulerSettings.demoCaption : file.name;
        const caption = await geminiService.generateCaptionForScheduling(sourceText, schedulerSettings.captionMode);
        addLog({ file: file.name, status: 'info', message: `Caption ready: "${caption.substring(0, 50)}..."` });

        // --- Step 1: Upload media without publishing ---
        addLog({ file: file.name, status: 'info', message: 'Uploading media file to Facebook...' });
        const mediaFormData = new FormData();
        mediaFormData.append('access_token', activePage.access_token);
        mediaFormData.append('source', file);
        mediaFormData.append('published', 'false'); // Upload but don't create a post yet

        const mediaEndpoint = schedulerSettings.postType === 'Image' ? 'photos' : 'videos';
        const mediaUploadResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/${activePage.id}/${mediaEndpoint}`, {
            method: 'POST',
            body: mediaFormData,
        });
        const mediaUploadData = await mediaUploadResponse.json();

        if (mediaUploadData.error) {
            throw new Error(`Media upload failed: ${mediaUploadData.error.message}`);
        }

        const mediaId = mediaUploadData.id;
        if (!mediaId) {
            throw new Error('Media uploaded, but did not receive a media ID from Facebook.');
        }
        addLog({ file: file.name, status: 'info', message: `Media uploaded successfully. ID: ${mediaId}. Now creating post...` });

        // --- Step 2: Create the feed post with the media and place ID ---
        const postFormData = new FormData();
        postFormData.append('access_token', activePage.access_token);
        postFormData.append('message', caption);
        postFormData.append('attached_media[0]', JSON.stringify({ media_fbid: mediaId }));

        if (schedulerSettings.checkInPlaceId) {
            addLog({ file: file.name, status: 'info', message: `Attaching place with ID: ${schedulerSettings.checkInPlaceId}.` });
            postFormData.append('place', schedulerSettings.checkInPlaceId);
        }
        
        if (scheduleTime) {
            postFormData.append('published', 'false');
            postFormData.append('scheduled_publish_time', Math.floor(scheduleTime.getTime() / 1000).toString());
            addLog({ file: file.name, status: 'info', message: `Scheduling post for ${scheduleTime.toLocaleString()}` });
        } else {
            addLog({ file: file.name, status: 'info', message: `Publishing post immediately...` });
        }

        const postResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/${activePage.id}/feed`, {
            method: 'POST',
            body: postFormData,
        });
        const postResponseData = await postResponse.json();

        if (postResponseData.error) {
            throw new Error(`Post creation failed: ${postResponseData.error.message}`);
        }
        
        const successMessage = scheduleTime
            ? `Scheduled successfully! Post ID: ${postResponseData.id}`
            : `Posted successfully! Post ID: ${postResponseData.id}`;
        addLog({ file: file.name, status: 'success', message: successMessage });

    }, [activePage, addLog, schedulerSettings]);


    const handleTestUpload = useCallback(async () => {
        if (isScheduling || isTesting) return;
        if (schedulerSettings.files.length === 0) {
            addLog({ file: '', status: 'error', message: 'No file selected to test.' });
            addNotification('No file selected to test.', 'error');
            return;
        }

        setIsTesting(true);
        addLog({ file: '', status: 'info', message: `Starting test upload of ${schedulerSettings.files[0].name}...` });
        
        try {
            await uploadPost(schedulerSettings.files[0], null);
            addNotification(`Test post "${schedulerSettings.files[0].name}" uploaded successfully.`, 'success');
        } catch (e: any) {
            const message = (e.message || '').toLowerCase();
            if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                addNotification('Facebook token expired. Please log in again.', 'error');
                handleLogout();
            } else {
                addLog({ file: schedulerSettings.files[0].name, status: 'error', message: `Test failed: ${e.message}` });
                addNotification(`Test upload failed: ${e.message}`, 'error');
            }
        } finally {
            setIsTesting(false);
        }
    }, [isScheduling, isTesting, schedulerSettings.files, addLog, uploadPost, addNotification, handleLogout]);
    
    // --- Smart Schedule Helpers ---
    const fetchPageInsights = async (page: FBPage): Promise<number[]> => {
        addLog({ file: '', status: 'info', message: `Analyzing page engagement... (mock data). This requires 'read_insights' permission.` });
        return [100, 80, 70, 60, 50, 60, 80, 120, 150, 200, 250, 300, 320, 310, 280, 260, 300, 350, 450, 500, 520, 480, 400, 250];
    };

    const getSmartSchedule = async (page: FBPage, numberOfPosts: number): Promise<Date[]> => {
        const insights = await fetchPageInsights(page);
        
        const hoursWithFollowers = insights.map((followers, hour) => ({ hour, followers }));
        hoursWithFollowers.sort((a, b) => b.followers - a.followers);

        const scheduleDates: Date[] = [];
        let currentDate = new Date();
        currentDate.setDate(currentDate.getDate() + 1);

        for (let i = 0; i < numberOfPosts; i++) {
            const bestHourData = hoursWithFollowers[i % 5];
            
            if (i > 0 && i % 3 === 0) {
                 currentDate.setDate(currentDate.getDate() + 1);
            }

            const postDate = new Date(currentDate);
            const randomMinute = Math.floor(Math.random() * 60);
            postDate.setHours(bestHourData.hour, randomMinute, 0, 0);

            if (postDate.getTime() < Date.now() + 600000) {
                 postDate.setDate(postDate.getDate() + 1);
            }

            scheduleDates.push(postDate);
        }
        
        scheduleDates.sort((a, b) => a.getTime() - b.getTime());
        return scheduleDates;
    };


    // Handle the actual scheduling process
    const handleSchedulingProcess = useCallback(async () => {
        if (isScheduling) {
            schedulerCancelToken.current.cancelled = true;
            addLog({ file: '', status: 'info', message: 'Stopping scheduling process...' });
            return;
        }
        if (schedulerSettings.files.length === 0) {
            addLog({ file: '', status: 'error', message: 'No files selected to schedule.' });
            addNotification('No files selected to schedule.', 'error');
            return;
        }
        if (!activePage) {
            addLog({ file: '', status: 'error', message: 'No Facebook Page selected.' });
            addNotification('No Facebook Page selected.', 'error');
            return;
        }

        setIsScheduling(true);
        setIsPaused(false);
        schedulerCancelToken.current.cancelled = false;
        setSchedulingLog([]);
        setSchedulingProgress({ current: 0, total: schedulerSettings.files.length });
        
        let scheduleTimes: Date[] = [];

        try {
            if (schedulerSettings.smartScheduleEnabled) {
                addLog({ file: '', status: 'info', message: 'Using Smart Schedule. Generating optimal post times...' });
                scheduleTimes = await getSmartSchedule(activePage, schedulerSettings.files.length);
                addLog({ file: '', status: 'info', message: `Smart Schedule generated ${scheduleTimes.length} post times.` });
            } else {
                addLog({ file: '', status: 'info', message: `Using Manual Schedule for ${schedulerSettings.files.length} files...` });
                const [startH, startM] = schedulerSettings.startTime.split(':').map(Number);
                const [endH, endM] = schedulerSettings.endTime.split(':').map(Number);
                let scheduleTime = new Date(schedulerSettings.startDate);
                scheduleTime.setHours(startH, startM, 0, 0);

                for (let i = 0; i < schedulerSettings.files.length; i++) {
                    scheduleTimes.push(new Date(scheduleTime));
                    scheduleTime.setMinutes(scheduleTime.getMinutes() + schedulerSettings.interval);
                    if (scheduleTime.getHours() > endH || (scheduleTime.getHours() === endH && scheduleTime.getMinutes() > endM)) {
                        scheduleTime.setDate(scheduleTime.getDate() + 1);
                        scheduleTime.setHours(startH, startM, 0, 0);
                    }
                }
            }
        } catch (e: any) {
             addLog({ file: '', status: 'error', message: `Schedule generation failed: ${e.message}` });
             addNotification(`Could not generate schedule: ${e.message}`, 'error');
             setIsScheduling(false);
             return;
        }

        for (let i = 0; i < schedulerSettings.files.length; i++) {
            if (schedulerCancelToken.current.cancelled) {
                addLog({ file: '', status: 'info', message: 'Scheduling cancelled by user.' });
                addNotification('Scheduling process cancelled.', 'info');
                break;
            }

            while (isPausedRef.current) {
                if (schedulerCancelToken.current.cancelled) break;
                await sleep(1000);
            }

            const currentFile = schedulerSettings.files[i];
            setSchedulingProgress({ current: i + 1, total: schedulerSettings.files.length });
            
            let scheduleTime = scheduleTimes[i];
            
            if (scheduleTime.getTime() < Date.now() + 600000) { // must be at least 10min in the future
                const originalTime = new Date(scheduleTime);
                scheduleTime.setDate(scheduleTime.getDate() + 1); // try same time next day
                addLog({ file: currentFile.name, status: 'info', message: `Time ${originalTime.toLocaleString()} is in the past. Auto-adjusted to ${scheduleTime.toLocaleString()}` });
            }
            
            try {
                await uploadPost(currentFile, scheduleTime);
            } catch (e: any) {
                addLog({ file: currentFile.name, status: 'error', message: `Failed: ${e.message}` });
                 const message = (e.message || '').toLowerCase();
                 if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                    addNotification('Facebook token expired during operation. Please log in again.', 'error');
                    handleLogout();
                    break;
                }
            }
        }

        addLog({ file: '', status: 'info', message: 'Scheduling complete.' });
        addNotification('Bulk scheduling process has finished.', 'success');
        setIsScheduling(false);
        setIsPaused(false);
    }, [schedulerSettings, activePage, addLog, isScheduling, uploadPost, addNotification, handleLogout]);
    
    const handlePageChange = useCallback((pageId: string) => {
        const newPage = pages.find(p => p.id === pageId) || null;
        setActivePage(newPage);
    }, [pages]);

    if (!accessToken || pages.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
                <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800/50 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-2xl shadow-2xl text-center">
                    <FacebookIcon className="mx-auto h-12 w-12 text-blue-500" />
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Connect to Facebook</h2>
                    <p className="text-gray-500 dark:text-gray-400">Enter your User Access Token to get started.</p>
                    {loginError && <p className="text-center text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/30 p-3 rounded-md">{loginError}</p>}
                    <div>
                        <label htmlFor="accessToken" className="sr-only">User Access Token</label>
                        <input
                            id="accessToken"
                            type="password"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="Paste your token here"
                            className="w-full p-3 text-center text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary focus:border-primary transition"
                        />
                         <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary/80 hover:text-primary hover:underline mt-2 block">
                            How to get a token?
                        </a>
                    </div>
                    <button onClick={handleFetchPages} disabled={isLoading} className="w-full px-4 py-3 font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-md hover:from-blue-700 hover:to-blue-600 shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center transition-all transform hover:-translate-y-px">
                        {isLoading ? <Spinner size="sm" /> : 'Connect to Facebook'}
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 p-4 bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700/50">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Facebook Post Scheduler</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Automate your content pipeline.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex-grow">
                        <label htmlFor="page-select" className="sr-only">Select Page</label>
                        <select
                            id="page-select"
                            value={activePage?.id || ''}
                            onChange={(e) => handlePageChange(e.target.value)}
                            className="w-full md:w-56 p-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary"
                        >
                            {pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}
                        </select>
                    </div>
                    <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">
                        Logout
                    </button>
                </div>
            </div>

            <SchedulerTab
                schedulerSettings={schedulerSettings}
                handleSettingChange={handleSettingChange}
                handleFileSelect={handleFileSelect}
                isScheduling={isScheduling}
                isPaused={isPaused}
                isTesting={isTesting}
                handleTestUpload={handleTestUpload}
                handleSchedulingProcess={handleSchedulingProcess}
                setIsPaused={setIsPaused}
                schedulingProgress={schedulingProgress}
                schedulingLog={schedulingLog}
                logContainerRef={logContainerRef}
            />
            
        </div>
    );
};

export default UploaderPage;