
import React, { useState, useEffect, useCallback, ChangeEvent, useRef, useMemo } from 'react';
import Spinner from './components/Spinner.tsx';
import * as geminiService from './services/geminiService.ts';
import { useNotification } from './src/contexts/NotificationContext.tsx';
import CrossPostSchedulerTab, { CrossPostSchedulerSettings } from './components/CrossPostSchedulerTab.tsx';
import { FBPage, ManagedPost } from './types.ts';
import html2canvas from 'html2canvas';
import { ThumbsUpIcon, ChatBubbleIcon } from './components/IconComponents.tsx';


// --- CONSTANTS ---
const ACCESS_TOKEN_KEY = 'fbUploader_accessToken_v2';
const PAGES_KEY = 'fbUploader_pages_v2';
const API_VERSION = 'v19.0';
const CROSPOST_HISTORY_KEY = 'crosspost_history_v1';

interface SchedulingLogEntry {
    timestamp: string;
    post: string;
    status: 'success' | 'error' | 'info';
    message: string;
}

// --- HELPER COMPONENTS ---
const FacebookIcon: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.323-1.325z"/>
    </svg>
);

const CrossPostPage: React.FC = () => {
    const { addNotification } = useNotification();
    
    // Auth State
    const [accessToken, setAccessToken] = useState<string>(() => localStorage.getItem(ACCESS_TOKEN_KEY) || '');
    const [pages, setPages] = useState<FBPage[]>(() => { try { return JSON.parse(localStorage.getItem(PAGES_KEY) || '[]'); } catch { return []; }});
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    // Page Selection & Data State
    const [sourcePage, setSourcePage] = useState<FBPage | null>(null);
    const [destinationPage, setDestinationPage] = useState<FBPage | null>(null);
    const [sourcePosts, setSourcePosts] = useState<ManagedPost[]>([]);
    const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
    const [isFetchingPosts, setIsFetchingPosts] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
    const [minLikes, setMinLikes] = useState('');
    const [minComments, setMinComments] = useState('');
    const [crossPostHistory, setCrossPostHistory] = useState<Set<string>>(new Set());
    
    // Scheduler State
    const [schedulerSettings, setSchedulerSettings] = useState<CrossPostSchedulerSettings>({
        startDate: new Date().toISOString().split('T')[0],
        interval: 60,
        startTime: '09:00',
        endTime: '22:00',
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

    // --- LOGIC ---
    const addLog = useCallback((entry: Omit<SchedulingLogEntry, 'timestamp'>) => {
        const timestamp = new Date().toLocaleTimeString();
        setSchedulingLog(prev => [{ ...entry, timestamp }, ...prev]);
    }, []);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = 0;
        }
    }, [schedulingLog]);

    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem(CROSPOST_HISTORY_KEY);
            if (savedHistory) {
                setCrossPostHistory(new Set(JSON.parse(savedHistory) as string[]));
            }
        } catch (e) {
            console.error("Failed to load cross-post history", e);
            localStorage.removeItem(CROSPOST_HISTORY_KEY);
        }
    }, []);

    const handleLogout = useCallback(() => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(PAGES_KEY);
        setAccessToken(''); setPages([]); setSourcePage(null); setDestinationPage(null); setLoginError(null);
        addNotification('You have been logged out.', 'info');
    }, [addNotification]);
    
    const handleFetchPages = useCallback(async () => {
        if (!accessToken) { addNotification('Please enter a User Access Token.', 'error'); return; }
        setIsLoading(true); setLoginError(null);
        try {
            const response = await fetch(`https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            const fetchedPages = data.data || [];
            setPages(fetchedPages);
            localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
            localStorage.setItem(PAGES_KEY, JSON.stringify(fetchedPages));
            if (fetchedPages.length > 0) {
                setSourcePage(fetchedPages[0]);
                setDestinationPage(fetchedPages.length > 1 ? fetchedPages[1] : fetchedPages[0]);
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
                setLoginError(`Failed to fetch pages: ${e.message}.`);
                addNotification(`Failed to fetch pages: ${e.message}.`, 'error');
            }
        } finally {
            setIsLoading(false);
        }
    }, [accessToken, handleLogout, addNotification]);

    useEffect(() => {
        if (accessToken && pages.length === 0) handleFetchPages();
        else if (pages.length > 0) {
            if (!sourcePage) setSourcePage(pages[0]);
            if (!destinationPage) setDestinationPage(pages.length > 1 ? pages[1] : pages[0]);
        }
    }, [accessToken, pages, sourcePage, destinationPage, handleFetchPages]);

    const fetchPostsFromUrl = useCallback(async (url: string) => {
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return {
            posts: data.data || [],
            nextUrl: data.paging?.next || null,
        };
    }, []);

    const handleFetchSourcePosts = useCallback(async () => {
        if (!sourcePage) return;
        setIsFetchingPosts(true);
        setSourcePosts([]);
        setSelectedPostIds(new Set());
        setNextPageUrl(null);
        try {
            const fields = 'id,message,full_picture,created_time,likes.summary(true),comments.summary(true)';
            const url = `https://graph.facebook.com/${API_VERSION}/${sourcePage.id}/posts?fields=${fields}&limit=25&access_token=${sourcePage.access_token}`;
            const { posts, nextUrl } = await fetchPostsFromUrl(url);
            setSourcePosts(posts);
            setNextPageUrl(nextUrl);
        } catch(e: any) {
            const message = (e.message || '').toLowerCase();
            if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                addNotification('Facebook token has expired. Please log in again.', 'error');
                handleLogout();
            } else {
                addNotification(`Failed to fetch posts: ${e.message}`, 'error');
            }
        } finally {
            setIsFetchingPosts(false);
        }
    }, [sourcePage, addNotification, fetchPostsFromUrl, handleLogout]);

    const handleLoadMorePosts = useCallback(async () => {
        if (!nextPageUrl || isFetchingMore) return;
        setIsFetchingMore(true);
        try {
            const { posts, nextUrl } = await fetchPostsFromUrl(nextPageUrl);
            setSourcePosts(prev => [...prev, ...posts]);
            setNextPageUrl(nextUrl);
        } catch (e: any) {
            addNotification(`Failed to load more posts: ${e.message}`, 'error');
        } finally {
            setIsFetchingMore(false);
        }
    }, [nextPageUrl, isFetchingMore, addNotification, fetchPostsFromUrl]);
    
    const handleSelectPost = (postId: string) => {
        setSelectedPostIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(postId)) {
                newSet.delete(postId);
            } else {
                newSet.add(postId);
            }
            return newSet;
        });
    };

    const manipulateImage = useCallback(async (post: ManagedPost): Promise<Blob | null> => {
        if (!post.full_picture) return null;
        
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.padding = '1px'; // Offset
        container.style.backgroundColor = '#000000'; // Outline color

        const borderDiv = document.createElement('div');
        borderDiv.style.padding = '5px'; // Border width
        borderDiv.style.backgroundColor = '#FFFFFF'; // Border color

        const img = document.createElement('img');
        img.crossOrigin = 'anonymous'; 
        img.src = post.full_picture;

        borderDiv.appendChild(img);
        container.appendChild(borderDiv);
        document.body.appendChild(container);
        
        return new Promise((resolve) => {
            img.onload = async () => {
                try {
                    const canvas = await html2canvas(container, { useCORS: true, allowTaint: true, backgroundColor: null, scale: 4 });
                    canvas.toBlob((blob) => {
                        document.body.removeChild(container);
                        resolve(blob);
                    }, 'image/jpeg', 0.95);
                } catch (error) {
                    document.body.removeChild(container);
                    console.error("html2canvas failed, falling back.", error);
                    resolve(null);
                }
            };
            img.onerror = () => {
                document.body.removeChild(container);
                console.error("Image load failed for manipulation, falling back.");
                resolve(null);
            };
        });
    }, []);

    const uploadCrossPost = useCallback(async (post: ManagedPost, scheduleTime: Date | null) => {
        if (!destinationPage) throw new Error("No destination page selected.");
        
        addLog({ post: post.id, status: 'info', message: 'Enhancing post...' });

        const [imageBlob, newCaption] = await Promise.all([
            manipulateImage(post),
            geminiService.generateCrossPostCaption(post.message || '')
        ]);
        
        addLog({ post: post.id, status: 'info', message: `Caption ready: "${newCaption.substring(0, 50)}..."` });

        const mediaFormData = new FormData();
        mediaFormData.append('access_token', destinationPage.access_token);
        if (imageBlob) {
             addLog({ post: post.id, status: 'info', message: 'Uploading new styled image...' });
             mediaFormData.append('source', imageBlob);
        } else {
             addLog({ post: post.id, status: 'info', message: 'Image manipulation failed. Using original image URL.' });
             mediaFormData.append('url', post.full_picture || '');
        }
        mediaFormData.append('published', 'false');

        const mediaUploadResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/${destinationPage.id}/photos`, { method: 'POST', body: mediaFormData });
        const mediaUploadData = await mediaUploadResponse.json();
        if (mediaUploadData.error) throw new Error(`Media upload failed: ${mediaUploadData.error.message}`);
        
        const mediaId = mediaUploadData.id;
        addLog({ post: post.id, status: 'info', message: `Media uploaded (ID: ${mediaId}). Creating post...` });

        const postFormData = new FormData();
        postFormData.append('access_token', destinationPage.access_token);
        postFormData.append('message', newCaption);
        postFormData.append('attached_media[0]', JSON.stringify({ media_fbid: mediaId }));
        if (schedulerSettings.checkInPlaceId) postFormData.append('place', schedulerSettings.checkInPlaceId);
        
        if (scheduleTime) {
            postFormData.append('published', 'false');
            postFormData.append('scheduled_publish_time', Math.floor(scheduleTime.getTime() / 1000).toString());
            addLog({ post: post.id, status: 'info', message: `Scheduling for ${scheduleTime.toLocaleString()}` });
        }

        const postResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/${destinationPage.id}/feed`, { method: 'POST', body: postFormData });
        const postResponseData = await postResponse.json();
        if (postResponseData.error) throw new Error(`Post creation failed: ${postResponseData.error.message}`);
        
        // Add to history on success
        const historyKey = `${post.id}|${destinationPage.id}`;
        setCrossPostHistory(prev => {
            const newHistorySet = new Set(prev);
            newHistorySet.add(historyKey);
            try {
                localStorage.setItem(CROSPOST_HISTORY_KEY, JSON.stringify(Array.from(newHistorySet)));
            } catch (e) {
                console.error("Failed to save cross-post history", e);
            }
            return newHistorySet;
        });

        const successMessage = scheduleTime ? `Scheduled successfully! ID: ${postResponseData.id}` : `Posted successfully!`;
        addLog({ post: post.id, status: 'success', message: successMessage });

    }, [destinationPage, schedulerSettings, addLog, manipulateImage]);

    const handleSchedulingProcess = useCallback(async () => {
        if (isScheduling) {
            schedulerCancelToken.current.cancelled = true;
            addLog({ post: '', status: 'info', message: 'Stopping process...' });
            return;
        }

        const postsToSchedule = sourcePosts.filter(p => selectedPostIds.has(p.id));
        if (postsToSchedule.length === 0 || !destinationPage || !sourcePage || destinationPage.id === sourcePage.id) {
            addNotification('Please select posts, a valid source, and a different destination page.', 'error');
            return;
        }
        
        setIsScheduling(true);
        setIsPaused(false);
        schedulerCancelToken.current.cancelled = false;
        setSchedulingLog([]);
        setSchedulingProgress({ current: 0, total: postsToSchedule.length });

        const [startH, startM] = schedulerSettings.startTime.split(':').map(Number);
        const [endH, endM] = schedulerSettings.endTime.split(':').map(Number);
        let scheduleTime = new Date(schedulerSettings.startDate);
        scheduleTime.setHours(startH, startM, 0, 0);

        for (let i = 0; i < postsToSchedule.length; i++) {
            if (schedulerCancelToken.current.cancelled) {
                addLog({ post: '', status: 'info', message: 'Scheduling cancelled by user.' });
                break;
            }

            while (isPausedRef.current) await sleep(1000);
            
            const currentPost = postsToSchedule[i];
            const historyKey = `${currentPost.id}|${destinationPage.id}`;
            setSchedulingProgress({ current: i + 1, total: postsToSchedule.length });

            if (crossPostHistory.has(historyKey)) {
                addLog({ post: currentPost.id, status: 'info', message: 'Skipped: This post has already been cross-posted to the destination page.' });
                continue;
            }

            let finalScheduleTime = new Date(scheduleTime);
            if (finalScheduleTime.getTime() < Date.now() + 600000) {
                 finalScheduleTime.setDate(finalScheduleTime.getDate() + 1);
            }

            try {
                await uploadCrossPost(currentPost, finalScheduleTime);
            } catch (e: any) {
                const message = (e.message || '').toLowerCase();
                addLog({ post: currentPost.id, status: 'error', message: `Failed: ${e.message}` });
                 if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                    addNotification('Facebook token expired during operation. Please log in again.', 'error');
                    handleLogout();
                    break; 
                }
            }

            scheduleTime.setMinutes(scheduleTime.getMinutes() + schedulerSettings.interval);
            if (scheduleTime.getHours() > endH || (scheduleTime.getHours() === endH && scheduleTime.getMinutes() > endM)) {
                scheduleTime.setDate(scheduleTime.getDate() + 1);
                scheduleTime.setHours(startH, startM, 0, 0);
            }
        }
        addNotification('Cross-posting process has finished.', 'success');
        setIsScheduling(false);
    }, [isScheduling, sourcePosts, selectedPostIds, destinationPage, sourcePage, schedulerSettings, addLog, uploadCrossPost, addNotification, crossPostHistory, handleLogout]);

    const filteredPosts = useMemo(() => {
        const likesNum = minLikes ? parseInt(minLikes, 10) : -1;
        const commentsNum = minComments ? parseInt(minComments, 10) : -1;

        if (!isFinite(likesNum) && !isFinite(commentsNum)) {
            return sourcePosts;
        }

        return sourcePosts.filter(post => {
            const postLikes = post.likes?.summary?.total_count ?? 0;
            const postComments = post.comments?.summary?.total_count ?? 0;

            const passesLikes = isFinite(likesNum) ? postLikes > likesNum : true;
            const passesComments = isFinite(commentsNum) ? postComments > commentsNum : true;

            return passesLikes && passesComments;
        });
    }, [sourcePosts, minLikes, minComments]);

    if (!accessToken || pages.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
                <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800/50 rounded-2xl shadow-2xl text-center">
                    <FacebookIcon className="mx-auto h-12 w-12 text-blue-500" />
                    <h2 className="text-3xl font-bold">Connect to Facebook</h2>
                    <p className="text-gray-500 dark:text-gray-400">Enter your User Access Token to get started.</p>
                    {loginError && <p className="text-red-500 bg-red-100 dark:bg-red-900/30 p-3 rounded-md">{loginError}</p>}
                    <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Paste your token here" className="w-full p-3 text-center bg-gray-100 dark:bg-gray-700 rounded-md"/>
                    <button onClick={handleFetchPages} disabled={isLoading} className="w-full py-3 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center">
                        {isLoading ? <Spinner size="sm" /> : 'Connect'}
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
             <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white dark:bg-gray-800/80 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700/50">
                <div>
                    <h1 className="text-2xl font-bold">Cross-Page Poster</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">AI-enhanced post sharing between your pages.</p>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700">Logout</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium mb-1">Source Page</label>
                    <select value={sourcePage?.id || ''} onChange={e => setSourcePage(pages.find(p => p.id === e.target.value) || null)} className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                        {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium mb-1">Destination Page</label>
                    <select value={destinationPage?.id || ''} onChange={e => setDestinationPage(pages.find(p => p.id === e.target.value) || null)} className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                        {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
            </div>
             <button onClick={handleFetchSourcePosts} disabled={isFetchingPosts || !sourcePage} className="w-full py-2 bg-primary text-primary-text rounded-md disabled:opacity-50 flex items-center justify-center">
                {isFetchingPosts ? <Spinner/> : `Fetch Posts from ${sourcePage?.name || ''}`}
             </button>

             {sourcePosts.length > 0 && (
                <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700/50">
                    <h3 className="font-bold mb-4">Select posts to cross-post ({selectedPostIds.size} selected)</h3>
                    
                    <div className="flex flex-wrap gap-4 items-center p-3 mb-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                        <label className="text-sm font-medium">Filter by:</label>
                        <div className="flex items-center gap-2">
                            <label htmlFor="min-likes" className="text-sm">Likes &gt;</label>
                            <input id="min-likes" type="number" value={minLikes} onChange={e => setMinLikes(e.target.value)} placeholder="e.g. 100" className="w-24 p-1.5 border rounded-md dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="min-comments" className="text-sm">Comments &gt;</label>
                            <input id="min-comments" type="number" value={minComments} onChange={e => setMinComments(e.target.value)} placeholder="e.g. 20" className="w-24 p-1.5 border rounded-md dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-96 overflow-y-auto p-2 scrollbar-thin">
                        {filteredPosts.map(post => {
                            const isAlreadyPosted = crossPostHistory.has(`${post.id}|${destinationPage?.id}`);
                            return (
                                <div key={post.id} onClick={() => !isAlreadyPosted && handleSelectPost(post.id)} className={`relative rounded-lg overflow-hidden border-4 group ${selectedPostIds.has(post.id) ? 'border-primary' : 'border-transparent'} ${isAlreadyPosted ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <img src={post.full_picture} alt="" className="w-full aspect-square object-cover transition-transform group-hover:scale-105" />
                                    {isAlreadyPosted && <div className="absolute inset-0 bg-black/60"></div>}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                                    <div className="absolute top-2 left-2 flex items-center gap-2 text-white text-xs bg-black/50 px-2 py-1 rounded-full">
                                        <div className="flex items-center gap-1"><ThumbsUpIcon className="w-3 h-3"/> {post.likes?.summary.total_count ?? 0}</div>
                                        <div className="flex items-center gap-1"><ChatBubbleIcon className="w-3 h-3"/> {post.comments?.summary.total_count ?? 0}</div>
                                    </div>
                                    <p className="absolute bottom-1 left-2 right-2 text-white text-xs leading-tight line-clamp-2">{post.message}</p>
                                    {selectedPostIds.has(post.id) && <div className="absolute top-2 right-2 bg-primary text-white w-5 h-5 flex items-center justify-center rounded-full text-xs shadow-lg">✓</div>}
                                    {isAlreadyPosted && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-white font-bold text-lg bg-black/70 px-4 py-1 rounded-lg">POSTED</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {nextPageUrl && !isFetchingMore && (
                        <div className="mt-4 text-center">
                            <button onClick={handleLoadMorePosts} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">
                                Load More Posts
                            </button>
                        </div>
                    )}
                    {isFetchingMore && <div className="flex justify-center mt-4"><Spinner /></div>}
                </div>
             )}

            <CrossPostSchedulerTab
                schedulerSettings={schedulerSettings}
                handleSettingChange={setSchedulerSettings}
                selectedPostCount={selectedPostIds.size}
                isScheduling={isScheduling}
                isPaused={isPaused}
                isTesting={isTesting}
                handleTestUpload={() => addNotification("Test function not available for cross-posting yet.", "info")}
                handleSchedulingProcess={handleSchedulingProcess}
                setIsPaused={setIsPaused}
                schedulingProgress={schedulingProgress}
                schedulingLog={schedulingLog}
                logContainerRef={logContainerRef}
            />
        </div>
    );
};

export default CrossPostPage;